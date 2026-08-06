. (Join-Path $PSScriptRoot 'common.ps1')
Read-DotEnv
$root = Get-AuraRoot
$runtimeDir = Assert-WithinAuraRoot (Join-Path $root '.runtime')
$pidDir = Assert-WithinAuraRoot (Join-Path $runtimeDir 'pids')
$logDir = Assert-WithinAuraRoot (Join-Path $root 'logs')
New-Item -ItemType Directory -Force -Path $pidDir, $logDir | Out-Null

$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'runtime-manifest.json') | ConvertFrom-Json
$runtimeRoot = Assert-WithinAuraRoot (Join-Path $runtimeDir 'llama.cpp')
$requestedBackend = if ($env:LLM_BACKEND) { $env:LLM_BACKEND.ToLowerInvariant() } else { 'auto' }
if ($requestedBackend -notin @('auto', 'hip', 'vulkan')) { throw 'LLM_BACKEND must be auto, hip, or vulkan.' }
$backendCandidates = if ($requestedBackend -eq 'auto') {
    @([string]$manifest.llamaCpp.defaultBackend, [string]$manifest.llamaCpp.fallbackBackend) | Select-Object -Unique
} else {
    @($requestedBackend)
}
$modelPath = if ($env:LLM_MODEL_PATH) { Assert-WithinAuraRoot (Join-Path $root $env:LLM_MODEL_PATH) } else { Assert-WithinAuraRoot (Join-Path $root 'models\Qwen3-8B-Q4_K_M.gguf') }
if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { throw "Model file not found: $modelPath" }
$hostName = if ($env:LLM_SERVER_HOST) { $env:LLM_SERVER_HOST } else { '127.0.0.1' }
if ($hostName -notin @('127.0.0.1', 'localhost')) { throw 'MVP only permits llama-server on loopback.' }
$port = if ($env:LLM_SERVER_PORT) { [int]$env:LLM_SERVER_PORT } else { 8080 }
$context = if ($env:LLM_CONTEXT_SIZE) { [int]$env:LLM_CONTEXT_SIZE } else { 8192 }
$gpuLayers = if ($env:LLM_GPU_LAYERS) { [int]$env:LLM_GPU_LAYERS } else { 99 }

# Windows PowerShell 5.1 joins Start-Process ArgumentList entries into one
# command line. Quote the model path explicitly so workspace paths containing
# spaces remain a single llama-server argument.
$quotedModelPath = '"' + $modelPath + '"'
$llamaArgs = @('-m', $quotedModelPath, '--host', $hostName, '--port', "$port", '-c', "$context", '--n-gpu-layers', "$gpuLayers", '--alias', 'aura-local', '--jinja', '-np', '1')
$llama = $null
$activeBackend = $null
foreach ($backendName in $backendCandidates) {
    $backendDir = Join-Path $runtimeRoot $backendName
    $llamaServer = Get-ChildItem -LiteralPath $backendDir -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $llamaServer) {
        Write-Warning "llama.cpp backend is not installed: $backendName"
        continue
    }
    Write-Host "Starting llama.cpp backend: $backendName"
    $stdout = Join-Path $logDir "llama-$backendName.out.log"
    $stderr = Join-Path $logDir "llama-$backendName.err.log"
    $candidate = Start-Process -FilePath $llamaServer.FullName -ArgumentList $llamaArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try {
        Wait-HttpReady -Url "http://${hostName}:$port/health" -TimeoutSeconds 180
        $llama = $candidate
        $activeBackend = $backendName
        break
    }
    catch {
        if (-not $candidate.HasExited) { Stop-Process -Id $candidate.Id -Force }
        Write-Warning "Backend '$backendName' failed to become ready. See $stderr"
        if ($requestedBackend -ne 'auto') { throw }
    }
}
if (-not $llama) { throw 'No usable llama.cpp backend. Run scripts/setup-runtime.ps1 and scripts/diagnose.ps1.' }
Set-Content -LiteralPath (Join-Path $pidDir 'llama.pid') -Value $llama.Id
Set-Content -LiteralPath (Join-Path $runtimeDir 'active-backend.txt') -Value $activeBackend

$corepackCommand = Get-Command 'corepack' -ErrorAction Stop
$web = Start-Process -FilePath $corepackCommand.Source -ArgumentList @('pnpm', 'dev') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'web.out.log') -RedirectStandardError (Join-Path $logDir 'web.err.log')
Set-Content -LiteralPath (Join-Path $pidDir 'web.pid') -Value $web.Id
Wait-HttpReady -Url 'http://127.0.0.1:3000/api/status' -TimeoutSeconds 120
Write-Host "Aura-GPT started with $activeBackend backend: http://127.0.0.1:3000"
