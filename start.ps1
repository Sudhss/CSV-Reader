$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".dev-server.pid"
$OutLog = Join-Path $Root ".dev-server.out.log"
$ErrLog = Join-Path $Root ".dev-server.err.log"
$Port = 5173

Set-Location $Root

if (Test-Path $PidFile) {
  $ExistingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
  if ($ExistingPid -and (Get-Process -Id $ExistingPid -ErrorAction SilentlyContinue)) {
    Write-Host "Dev server is already running at http://127.0.0.1:$Port/ (PID $ExistingPid)"
    exit 0
  }

  Remove-Item -LiteralPath $PidFile -Force
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
  Write-Host "Installing dependencies..."
  npm install
}

Write-Host "Starting dev server at http://127.0.0.1:$Port/ ..."
$Process = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @("run", "dev", "--", "--port", "$Port", "--strictPort") `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

$Process.Id | Set-Content -Path $PidFile
Start-Sleep -Seconds 2

if ($Process.HasExited) {
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  Write-Host "Dev server failed to start. Check:"
  Write-Host "  $OutLog"
  Write-Host "  $ErrLog"
  exit 1
}

Write-Host "Ready: http://127.0.0.1:$Port/"
Write-Host "Stop it with: .\stop.ps1"
