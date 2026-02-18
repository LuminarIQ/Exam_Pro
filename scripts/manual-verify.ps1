param(
  [string]$ApiBase = "http://localhost:3000/api",
  [string]$TenantId = "public",
  [string]$AdminEmail = "admin@demo.com",
  [string]$TeacherEmail = "teacher@demo.com",
  [string]$Password = "Password123!",
  [switch]$RunDbSetup,
  [switch]$RunBuilds,
  [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

function Write-Step($message) {
  Write-Host "`n==> $message" -ForegroundColor Cyan
}

function Pass($message) {
  Write-Host "[PASS] $message" -ForegroundColor Green
}

function Fail($message) {
  Write-Host "[FAIL] $message" -ForegroundColor Red
}

function Parse-EnvFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    $map[$k] = $v
  }
  return $map
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    $Body
  )

  $params = @{
    Method = $Method
    Uri = $Url
    Headers = $Headers
  }
  if ($null -ne $Body) {
    $params['ContentType'] = 'application/json'
    $params['Body'] = ($Body | ConvertTo-Json -Depth 8)
  }

  return Invoke-RestMethod @params
}

$root = (Resolve-Path "$PSScriptRoot\..").Path
$apiEnvPath = Join-Path $root 'apps/api/.env'
$infraDir = Join-Path $root 'infra/docker'

Write-Host "Adaptive Tutor Manual Verification" -ForegroundColor Yellow
Write-Host "Root: $root"

if (-not $SkipDocker) {
  Write-Step "Starting Docker infra"
  Push-Location $infraDir
  docker compose up -d | Out-Null
  Pop-Location
  Pass "Docker infra started"
}

if ($RunDbSetup) {
  Write-Step "Running DB migration + seed"
  Push-Location $root
  pnpm --filter @app/api exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Fail "Migration failed"
    exit 1
  }
  pnpm --filter @app/api prisma:seed
  if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Fail "Seed failed"
    exit 1
  }
  Pop-Location
  Pass "Migrations and seed complete"
}

Write-Step "Ensuring API is reachable"
$maxAttempts = 20
$healthy = $false
for ($i = 1; $i -le $maxAttempts; $i++) {
  try {
    $h = Invoke-RestMethod -Method Get -Uri "$ApiBase/health"
    if ($h.status -eq 'ok') { $healthy = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $healthy) {
  Fail "API is not reachable at $ApiBase. Start API with: pnpm --filter @app/api dev"
  exit 1
}
Pass "API health endpoint reachable"

Write-Step "Checking readiness"
$ready = Invoke-RestMethod -Method Get -Uri "$ApiBase/health/ready"
if (-not $ready.ready) {
  Fail "Readiness failed: $($ready | ConvertTo-Json -Depth 5)"
  exit 1
}
Pass "Readiness check passed"

Write-Step "Logging in as admin and teacher"
$adminLogin = Invoke-Json -Method 'POST' -Url "$ApiBase/auth/login" -Headers @{ 'x-tenant-id' = $TenantId } -Body @{ email = $AdminEmail; password = $Password }
$teacherLogin = Invoke-Json -Method 'POST' -Url "$ApiBase/auth/login" -Headers @{ 'x-tenant-id' = $TenantId } -Body @{ email = $TeacherEmail; password = $Password }
if (-not $adminLogin.accessToken -or -not $teacherLogin.accessToken) {
  Fail "Login failed"
  exit 1
}
Pass "Demo login works"

Write-Step "Checking metrics endpoint protection"
$metricsToken = (Parse-EnvFile -Path $apiEnvPath)['METRICS_TOKEN']
if (-not $metricsToken) { $metricsToken = 'metrics-secret' }

$unauthorized = $false
try {
  Invoke-WebRequest -Method Get -Uri "$ApiBase/metrics" -UseBasicParsing | Out-Null
} catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 401) { $unauthorized = $true }
}
if (-not $unauthorized) {
  Fail "Expected /metrics to be protected (401 without token)"
  exit 1
}
Pass "Metrics endpoint is protected"

$metricsResp = Invoke-WebRequest -Method Get -Uri "$ApiBase/metrics" -Headers @{ Authorization = "Bearer $metricsToken" } -UseBasicParsing
if ($metricsResp.Content -notmatch 'adaptive_http_requests_total') {
  Fail "Metrics output missing expected counters"
  exit 1
}
Pass "Metrics endpoint authorized and returning Prometheus data"

Write-Step "Fetching taxonomy and queueing AI generation"
$taxonomy = Invoke-Json -Method 'GET' -Url "$ApiBase/taxonomy" -Headers @{ 'x-tenant-id' = $TenantId; Authorization = "Bearer $($teacherLogin.accessToken)" } -Body $null
$topicId = $null
foreach ($s in $taxonomy) {
  foreach ($c in $s.chapters) {
    if ($c.topics.Count -gt 0) { $topicId = $c.topics[0].id; break }
  }
  if ($topicId) { break }
}
if (-not $topicId) {
  Fail "No topic found in taxonomy"
  exit 1
}

$job = Invoke-Json -Method 'POST' -Url "$ApiBase/ai/generate-question" -Headers @{ 'x-tenant-id' = $TenantId; Authorization = "Bearer $($teacherLogin.accessToken)" } -Body @{ topicIds = @($topicId) }
if (-not $job.jobId) {
  Fail "AI generate job enqueue failed"
  exit 1
}
Pass "AI generation job enqueued"

Start-Sleep -Seconds 2
$queueMetrics = Invoke-Json -Method 'GET' -Url "$ApiBase/ai/queue-metrics" -Headers @{ 'x-tenant-id' = $TenantId; Authorization = "Bearer $($teacherLogin.accessToken)" } -Body $null
if (-not $queueMetrics.queue) {
  Fail "Queue metrics endpoint failed"
  exit 1
}
Pass "Queue metrics endpoint works"

Write-Step "Checking tenant admin metrics"
$tenantMetrics = Invoke-Json -Method 'GET' -Url "$ApiBase/admin/tenant-metrics" -Headers @{ 'x-tenant-id' = $TenantId; Authorization = "Bearer $($adminLogin.accessToken)" } -Body $null
if ($null -eq $tenantMetrics.activeUsers -or $null -eq $tenantMetrics.aiUsage) {
  Fail "Tenant metrics payload incomplete"
  exit 1
}
Pass "Tenant metrics endpoint works"

if ($RunBuilds) {
  Write-Step "Running lint/tests/build"
  Push-Location $root
  pnpm --filter @app/api lint
  pnpm --filter @app/api test
  pnpm --filter @app/api test:e2e
  pnpm --filter @app/api build
  pnpm --filter @app/web build
  Pop-Location
  Pass "Lint/tests/build completed"
}

Write-Host "`nAll manual verification checks passed." -ForegroundColor Green
Write-Host "If web UI is running, validate login in browser as final UX check." -ForegroundColor Green
