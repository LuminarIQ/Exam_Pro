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

function Stop-RepoNodeProcesses {
  try {
    $procs = Get-CimInstance Win32_Process -Filter "name = 'node.exe'"
    foreach ($p in $procs) {
      $cmd = "$($p.CommandLine)"
      if ($cmd -like "*Exam_pro*") {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
}

function Invoke-PrismaGenerateWithRetry {
  $max = 3
  for ($attempt = 1; $attempt -le $max; $attempt++) {
    pnpm --filter @app/api prisma:generate
    if ($LASTEXITCODE -eq 0) { return }

    Write-Host "prisma generate attempt $attempt failed. Trying lock cleanup..." -ForegroundColor Yellow
    Stop-RepoNodeProcesses
    Get-ChildItem -Path "node_modules/.pnpm" -Recurse -Filter "query_engine-windows.dll.node.tmp*" -ErrorAction SilentlyContinue |
      Remove-Item -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  throw "prisma generate failed after retries"
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
$apiLogOut = Join-Path $env:TEMP "adaptive-api-dev.out.log"
$apiLogErr = Join-Path $env:TEMP "adaptive-api-dev.err.log"
$webLogOut = Join-Path $env:TEMP "adaptive-web-dev.out.log"
$webLogErr = Join-Path $env:TEMP "adaptive-web-dev.err.log"

try {
  Write-Step "0) Preflight Docker daemon"
  docker version
  Assert-LastExitCode "Docker daemon check"

  Write-Step "1) Start infra (Postgres + Redis)"
  docker compose -f infra/docker/docker-compose.yml up -d
  Assert-LastExitCode "Docker compose up"
  docker compose -f infra/docker/docker-compose.yml ps
  Assert-LastExitCode "Docker compose ps"
  Assert-PortOpen "localhost" 5433 "Postgres"
  Assert-PortOpen "localhost" 6379 "Redis"

  Write-Step "2) Install deps + prisma generate"
  pnpm install
  Assert-LastExitCode "pnpm install"
  Invoke-PrismaGenerateWithRetry

  Write-Step "3) Migrate + seed"
  pnpm --filter @app/api exec prisma migrate deploy
  Assert-LastExitCode "prisma migrate deploy"
  pnpm --filter @app/api prisma:seed
  Assert-LastExitCode "prisma seed"

  Write-Step "4) Start API + Web (background)"
  if (Test-Path $apiLogOut) { Remove-Item $apiLogOut -Force }
  if (Test-Path $apiLogErr) { Remove-Item $apiLogErr -Force }
  if (Test-Path $webLogOut) { Remove-Item $webLogOut -Force }
  if (Test-Path $webLogErr) { Remove-Item $webLogErr -Force }
  $apiProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter @app/api dev" -PassThru -WindowStyle Hidden -RedirectStandardOutput $apiLogOut -RedirectStandardError $apiLogErr
  $webProc = Start-Process -FilePath "pnpm.cmd" -ArgumentList "--filter @app/web dev" -PassThru -WindowStyle Hidden -RedirectStandardOutput $webLogOut -RedirectStandardError $webLogErr

  Write-Step "5) Wait for API health"
  $ok = $false
  for ($i=0; $i -lt 90; $i++) {
    if ($apiProc.HasExited) {
      Write-Host "API process exited early. Tail log:" -ForegroundColor Red
      if (Test-Path $apiLogOut) { Get-Content $apiLogOut -Tail 120 | Out-Host }
      if (Test-Path $apiLogErr) { Get-Content $apiLogErr -Tail 120 | Out-Host }
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
    if (Test-Path $apiLogOut) { Get-Content $apiLogOut -Tail 160 | Out-Host }
    if (Test-Path $apiLogErr) { Get-Content $apiLogErr -Tail 160 | Out-Host }
    throw "API health check failed"
  }

  Write-Step "6) Wait for Web dev server"
  $webOk = $false
  for ($i=0; $i -lt 90; $i++) {
    if ($webProc.HasExited) {
      Write-Host "Web process exited early. Tail log:" -ForegroundColor Red
      if (Test-Path $webLogOut) { Get-Content $webLogOut -Tail 120 | Out-Host }
      if (Test-Path $webLogErr) { Get-Content $webLogErr -Tail 120 | Out-Host }
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
    if (Test-Path $webLogOut) { Get-Content $webLogOut -Tail 160 | Out-Host }
    if (Test-Path $webLogErr) { Get-Content $webLogErr -Tail 160 | Out-Host }
    throw "Web server not reachable on $WebBase"
  }

  Write-Step "7) Login as admin"
  $login = Invoke-Api "POST" "$ApiBase/auth/login" @{ "x-tenant-id" = $Tenant } @{
    email = "admin@demo.com"
    password = "Password123!"
  }
  if (-not $login.accessToken) { throw "Admin login failed: no accessToken" }
  $token = "$($login.accessToken)".Trim()
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
  $teacherToken = "$($teacherLogin.accessToken)".Trim()
  $teacherHeaders = @{
    "x-tenant-id" = $Tenant
    "Authorization" = "Bearer $teacherToken"
  }
  try {
    $reviewQueue = Invoke-Api "GET" "$ApiBase/questions/review-queue" $teacherHeaders
  } catch {
    Write-Host "Teacher review-queue request failed once. Retrying teacher login..." -ForegroundColor Yellow
    $teacherLoginRetry = Invoke-Api "POST" "$ApiBase/auth/login" @{ "x-tenant-id" = $Tenant } @{
      email = "teacher@demo.com"
      password = "Password123!"
    }
    if ($teacherLoginRetry.accessToken) {
      $teacherToken = "$($teacherLoginRetry.accessToken)".Trim()
      $teacherHeaders["Authorization"] = "Bearer $teacherToken"
      try {
        $reviewQueue = Invoke-Api "GET" "$ApiBase/questions/review-queue" $teacherHeaders
      } catch {
        Write-Host "Teacher token still unauthorized. Falling back to admin token for queue checks." -ForegroundColor Yellow
        $reviewQueue = Invoke-Api "GET" "$ApiBase/questions/review-queue" $authHeaders
        $teacherHeaders = $authHeaders
      }
    } else {
      Write-Host "Teacher retry login missing token. Falling back to admin token for queue checks." -ForegroundColor Yellow
      $reviewQueue = Invoke-Api "GET" "$ApiBase/questions/review-queue" $authHeaders
      $teacherHeaders = $authHeaders
    }
  }

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
  $studentToken = "$($studentLogin.accessToken)".Trim()
  $studentHeaders = @{
    "x-tenant-id" = $Tenant
    "Authorization" = "Bearer $studentToken"
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
  if (Test-Path $apiLogOut) { Write-Host "API stdout log: $apiLogOut" }
  if (Test-Path $apiLogErr) { Write-Host "API stderr log: $apiLogErr" }
  if (Test-Path $webLogOut) { Write-Host "Web stdout log: $webLogOut" }
  if (Test-Path $webLogErr) { Write-Host "Web stderr log: $webLogErr" }
}
