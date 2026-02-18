param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'SilentlyContinue'

$lines = netstat -ano | Select-String ":$Port"
if (-not $lines) {
  Write-Host "No listeners found on port $Port"
  exit 0
}

$pids = @()
foreach ($line in $lines) {
  $parts = ($line -replace '^\s+', '') -split '\s+'
  if ($parts.Length -ge 5) {
    $state = $parts[3]
    $pid = $parts[4]
    if ($state -eq 'LISTENING' -and $pid -match '^\d+$') {
      $pids += [int]$pid
    }
  }
}

$pids = $pids | Select-Object -Unique
if (-not $pids) {
  Write-Host "No LISTENING process found on port $Port"
  exit 0
}

foreach ($pid in $pids) {
  try {
    $proc = Get-Process -Id $pid -ErrorAction Stop
    Write-Host "Stopping PID $pid ($($proc.ProcessName)) on port $Port"
    Stop-Process -Id $pid -Force -ErrorAction Stop
  } catch {
    Write-Host "Failed to stop PID $pid"
  }
}
