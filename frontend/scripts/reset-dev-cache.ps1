$ErrorActionPreference = "SilentlyContinue"

$frontendRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $frontendRoot

$processes = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -in @("node.exe", "cmd.exe")) -and
  ($_.CommandLine -match "C:\\dev\\ap\\frontend|next dev|npm.*run dev")
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
}

Start-Sleep -Seconds 1

$nextDir = Join-Path $frontendRoot ".next"
if (Test-Path $nextDir) {
  Remove-Item -LiteralPath $nextDir -Recurse -Force
}

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Start-Process `
  -FilePath "C:\Program Files\nodejs\npm.cmd" `
  -ArgumentList @("run", "dev") `
  -WorkingDirectory $frontendRoot `
  -RedirectStandardOutput (Join-Path $logDir "frontend-dev.out.log") `
  -RedirectStandardError (Join-Path $logDir "frontend-dev.err.log") `
  -WindowStyle Hidden

Write-Host "Frontend dev cache reset. Open http://localhost:3000 after a few seconds."
