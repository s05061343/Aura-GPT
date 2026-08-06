. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-AuraRoot
Set-Location -LiteralPath $root

function Test-Command([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-SetupComplete {
    $markerPath = Join-Path $root '.runtime\setup-complete.json'
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { return $false }
    try {
        $marker = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
        $manifestHash = (Get-FileHash -LiteralPath (Join-Path $root 'runtime-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
        if ([string]$marker.manifestSha256 -ne $manifestHash) { return $false }
        $manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'runtime-manifest.json') | ConvertFrom-Json
        $modelPath = Join-Path $root "models\$($manifest.model.file)"
        $hipServer = Get-ChildItem -LiteralPath (Join-Path $root '.runtime\llama.cpp\hip') -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        $vulkanServer = Get-ChildItem -LiteralPath (Join-Path $root '.runtime\llama.cpp\vulkan') -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
        return (Test-Path -LiteralPath $modelPath -PathType Leaf) -and $hipServer -and $vulkanServer
    }
    catch {
        return $false
    }
}

try {
    if (-not (Test-Command 'node.exe')) { throw 'Node.js was not found. Install Node.js 24 LTS first.' }
    $nodeMajor = [int]((& node.exe --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 24) { throw "Node.js 24 or newer is required. Current version: $(& node.exe --version)" }
    $corepackCommand = Get-Command 'corepack' -ErrorAction SilentlyContinue
    if (-not $corepackCommand) { throw 'Corepack was not found. Reinstall Node.js 24 with Corepack.' }

    if (-not (Test-Path -LiteralPath (Join-Path $root '.env'))) {
        Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
        Write-Host 'Created .env from .env.example.'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules\.modules.yaml'))) {
        Write-Host 'Installing JavaScript dependencies...'
        & $corepackCommand.Source pnpm install
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
    }

    if (-not (Test-SetupComplete)) {
        Write-Host 'Runtime or verified model is incomplete. Running setup...'
        & (Join-Path $PSScriptRoot 'setup-runtime.ps1')
    }

    try {
        $status = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/status' -UseBasicParsing -TimeoutSec 3
        if ($status.StatusCode -eq 200) {
            Write-Host 'Aura-GPT is already running.'
            Start-Process 'http://127.0.0.1:3000'
            exit 0
        }
    }
    catch { }

    & (Join-Path $PSScriptRoot 'start.ps1')
    Start-Process 'http://127.0.0.1:3000'
}
catch {
    Write-Error $_
    exit 1
}
