$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskVersion = '22.19.0'
$taskName = "node-v$taskVersion-win-x64"
$taskLocal = Join-Path $taskRoot '.local'
$taskRuntime = Join-Path $taskLocal $taskName
$taskNode = Join-Path $taskRuntime 'node.exe'
$taskNpm = Join-Path $taskRuntime 'node_modules\npm\bin\npm-cli.js'
New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'logs') | Out-Null
Start-Transcript -Path (Join-Path $taskRoot 'logs\setup.log') -Force | Out-Null
try {
    if (!(Test-Path -LiteralPath $taskNode)) {
        Write-Host '[1/4] Downloading the project-local Node.js runtime (no administrator access needed)...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        New-Item -ItemType Directory -Force -Path $taskLocal | Out-Null
        $taskArchive = Join-Path $taskLocal "$taskName.zip"
        $taskBase = "https://nodejs.org/dist/v$taskVersion"
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri "$taskBase/$taskName.zip" -OutFile $taskArchive
        $taskChecksums = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri "$taskBase/SHASUMS256.txt").Content
        $taskMatch = [regex]::Match($taskChecksums, "(?m)^([a-f0-9]{64})\s+$taskName\.zip\s*$")
        if (!$taskMatch.Success -or (Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne $taskMatch.Groups[1].Value) {
            throw 'Node.js download checksum mismatch. Run setup again.'
        }
        Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskLocal -Force
    }
    $taskActual = & $taskNode -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or $taskActual -ne $taskVersion -or !(Test-Path -LiteralPath $taskNpm)) {
        throw 'The local runtime is incomplete. Rename .local and run setup again.'
    }
    $env:PATH = "$taskRuntime;$env:PATH"
    Write-Host '[2/4] Installing the exact dependencies from package-lock.json...'
    & $taskNode $taskNpm ci --include=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and logs/setup.log.' }
    Write-Host '[3/4] Creating .env if it does not exist...'
    if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
    Write-Host '[4/4] Checking types and building the website...'
    & $taskNode $taskNpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. See logs/setup.log.' }
    Write-Host 'Setup complete. Double-click start_local.bat to launch the arena.'
} catch {
    Write-Host "Setup failed: $_" -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}
Stop-Transcript | Out-Null
exit 0
