$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".dev-server.pid"

if (-not (Test-Path $PidFile)) {
  Write-Host "No dev server PID file found."
  exit 0
}

$ServerPid = Get-Content $PidFile -ErrorAction SilentlyContinue

if (-not $ServerPid) {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Removed empty PID file."
  exit 0
}

$Process = Get-Process -Id $ServerPid -ErrorAction SilentlyContinue

if ($Process) {
  Stop-Process -Id $ServerPid -Force
  Write-Host "Stopped dev server (PID $ServerPid)."
} else {
  Write-Host "Dev server was not running."
}

Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
