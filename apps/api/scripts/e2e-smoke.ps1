# scripts/e2e-smoke.ps1
# Run from repo root:
# powershell -ExecutionPolicy Bypass -File .\apps\api\scripts\e2e-smoke.ps1

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Assert-LastExitCode($context) {
  if ($LASTEXITCODE -ne 0) {
    throw "$context failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Api($method, $url, $headers = @{}, $body = $null) {
  if ($null -ne $body) {
    return Invoke-RestMethod -Method $method -Uri $url -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10)
  }
  return Invoke-RestMethod -Method $method -Uri $url -Headers $headers
}

function Assert-PortOpen($targetHost, $targetPort, $label) {
  $probe = Test-NetConnection $targetHost -Port $targetPort -WarningAction SilentlyContinue
  if (-not $probe.TcpTestSucceeded) {
    throw "$label is not reachable on ${targetHost}:$targetPort"
  }
}

$ApiBase = "http://localhost:3000/api"
$WebBase = "http://localhost:5173"
$Tenant = "public"
$apiProc = $null
$webProc = $null
$apiLog = Join-Path $env:TEMP "adaptive-api-dev.log"
$webLog = Join-Path $env:TEMP "adaptive-web-dev.log"

try {
  Write-Step "0) Preflight Docker daemon"
  docker version | Out-Host
  Assert-LastExitCode "Docker daemon check"

  Write-Step "1) Start infra (Postgres + Redis)"
  docker compose -f infra/docker/docker-compose.yml up -d | Out-Host
  Assert-LastExitCode "Docker compose up"
  docker compose -f infra/docker/docker-compose.yml ps | Out-Host
  Assert-LastExitCode "Docker compose ps"
  Assert-PortOpen "localhost" 5433 "Postgres"
  Assert-PortOpen "localhost" 6379 "Redis"

  Write-Step "2) Install deps + prisma generate"
  pnpm install | Out-Host
  Assert-LastExitCode "pnpm install"
  pnpm --filter @app/api prisma:generate | Out-Host
  Assert-LastExitCode "prisma generate"

  Write-Step "3) Migrate + seed"
  pnpm --filter @app/api exec prisma migrate deploy | Out-Host
  Assert-LastExitCode "prisma migrate deploy"
  pnpm --filter @app/api prisma:seed | Out-Host
  Assert-LastExitCode "prisma seed"

  Write-Step "4) Start API + Web (background)"
  if (Test-Path $apiLog) { Remove-Item $apiLog -Force }
  if (Test-Path $webLog) { Remove-Item $webLog -Force }
  $apiProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter @app/api dev" -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiLog -RedirectStandardError $apiLog
  $webProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter @app/web dev" -PassThru -WindowStyle Hidden -RedirectStandardOutput $webLog -RedirectStandardError $webLog

  Write-Step "5) Wait for API health"
  $ok = $false
  for ($i=0; $i -lt 90; $i++) {
    if ($apiProc.HasExited) {
      Write-Host "API process exited early. Tail log:" -ForegroundColor Red
      if (Test-Path $apiLog) { Get-Content $apiLog -Tail 120 | Out-Host }
      throw "API process exited before health became ready"
    }
    try {
      $h = Invoke-RestMethod -Uri "$ApiBase/health"
      if ($h.status -eq "ok") { $ok = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
  }
  if (-not $ok) {
    Write-Host "API health check failed. Tail log:" -ForegroundColor Red
    if (Test-Path $apiLog) { Get-Content $apiLog -Tail 160 | Out-Host }
    throw "API health check failed"
  }

  Write-Step "6) Wait for Web dev server"
  $webOk = $false
  for ($i=0; $i -lt 90; $i++) {
    if ($webProc.HasExited) {
      Write-Host "Web process exited early. Tail log:" -ForegroundColor Red
      if (Test-Path $webLog) { Get-Content $webLog -Tail 120 | Out-Host }
      throw "Web process exited before dev server became reachable"
    }
    try {
      $resp = Invoke-WebRequest -Uri $WebBase -UseBasicParsing
      if ($resp.StatusCode -eq 200) { $webOk = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
  }
  if (-not $webOk) {
    Write-Host "Web server check failed. Tail log:" -ForegroundColor Red
    if (Test-Path $webLog) { Get-Content $webLog -Tail 160 | Out-Host }
    throw "Web server not reachable on $WebBase"
  }

  Write-Step "7) Login as admin"
  $login = Invoke-Api "POST" "$ApiBase/auth/login" @{ "x-tenant-id" = $Tenant } @{
    email = "admin@demo.com"
    password = "Password123!"
  }
  if (-not $login.accessToken) { throw "Admin login failed: no accessToken" }
  $token = $login.accessToken
  $authHeaders = @{
    "x-tenant-id" = $Tenant
    "Authorization" = "Bearer $token"
  }

  Write-Step "8) Admin tenant metrics + AI governance"
  $tenantMetrics = Invoke-Api "GET" "$ApiBase/admin/tenant-metrics" $authHeaders
  $aiGov = Invoke-Api "GET" "$ApiBase/admin/ai-governance" $authHeaders
  if ($null -eq $tenantMetrics.activeUsers) { throw "tenant-metrics missing activeUsers" }
  if ($null -eq $aiGov.generation) { throw "ai-governance missing generation block" }

  Write-Step "9) Teacher login and review queue"
  $teacherLogin = Invoke-Api "POST" "$ApiBase/auth/login" @{ "x-tenant-id" = $Tenant } @{
    email = "teacher@demo.com"
    password = "Password123!"
  }
  if (-not $teacherLogin.accessToken) { throw "Teacher login failed" }
  $teacherHeaders = @{
    "x-tenant-id" = $Tenant
    "Authorization" = "Bearer $teacherLogin.accessToken"
  }
  $reviewQueue = Invoke-Api "GET" "$ApiBase/questions/review-queue" $teacherHeaders

  if ($reviewQueue.Count -gt 0) {
    $q = $reviewQueue[0]
    Write-Step "10) Rubric validate first draft question"
    $rubric = Invoke-Api "GET" "$ApiBase/questions/$($q.id)/rubric-validate" $teacherHeaders
    if ($null -eq $rubric.valid) { throw "Rubric response missing valid" }
    Write-Host "Rubric valid=$($rubric.valid), score=$($rubric.score)"
  } else {
    Write-Host "No draft questions in review queue (this is acceptable)." -ForegroundColor Yellow
  }

  Write-Step "11) Student login + dashboard"
  $studentLogin = Invoke-Api "POST" "$ApiBase/auth/login" @{ "x-tenant-id" = $Tenant } @{
    email = "student@demo.com"
    password = "Password123!"
  }
  if (-not $studentLogin.accessToken) { throw "Student login failed" }
  $studentHeaders = @{
    "x-tenant-id" = $Tenant
    "Authorization" = "Bearer $studentLogin.accessToken"
  }

  $dashboard = Invoke-Api "GET" "$ApiBase/attempts/dashboard" $studentHeaders
  if ($null -eq $dashboard.nextBestAction) { throw "Student dashboard missing nextBestAction" }

  Write-Step "12) Optional diagnostic start (if topics available)"
  $taxonomy = Invoke-Api "GET" "$ApiBase/taxonomy" $studentHeaders
  $topicIds = @()
  foreach ($s in $taxonomy) {
    foreach ($c in $s.chapters) {
      foreach ($t in $c.topics) { $topicIds += $t.id }
    }
  }
  if ($topicIds.Count -gt 0) {
    $pick = $topicIds | Select-Object -First 2
    try {
      $startAttempt = Invoke-Api "POST" "$ApiBase/attempts/diagnostic/start" $studentHeaders @{
        topicIds = $pick
        questionCount = 10
      }
      if ($startAttempt.attemptId) {
        Write-Host "Started diagnostic attempt: $($startAttempt.attemptId)"
      }
    } catch {
      Write-Host "Diagnostic start skipped/failed (likely no approved questions for selected topics)." -ForegroundColor Yellow
    }
  }

  Write-Step "SUCCESS"
  Write-Host "Smoke test completed." -ForegroundColor Green
  Write-Host "API: $ApiBase"
  Write-Host "Web: $WebBase"
}
finally {
  Write-Step "Cleanup background dev processes"
  if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }
  if ($webProc -and -not $webProc.HasExited) { Stop-Process -Id $webProc.Id -Force }
  if (Test-Path $apiLog) { Write-Host "API log: $apiLog" }
  if (Test-Path $webLog) { Write-Host "Web log: $webLog" }
}
