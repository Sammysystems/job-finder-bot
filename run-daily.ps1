$ErrorActionPreference = "Stop"

$root = "C:\Users\USER\Desktop\Work Studio\job-finder-bot"
$logDir = Join-Path $root "logs"
$log = Join-Path $logDir ("run-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Set-Location $root

"=== run started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Out-File -FilePath $log -Append -Encoding utf8

$output = & npx.cmd tsx src/run.ts 2>&1 | Out-String
$code = $LASTEXITCODE
$output | Out-File -FilePath $log -Append -Encoding utf8

"=== run finished $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') exit=$code ===" | Out-File -FilePath $log -Append -Encoding utf8

# Keep the last 30 daily logs only.
Get-ChildItem $logDir -Filter "run-*.log" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
