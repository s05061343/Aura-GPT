. (Join-Path $PSScriptRoot 'common.ps1')
Read-DotEnv
$root = Get-AuraRoot
$runtimeDir = Assert-WithinAuraRoot (Join-Path $root '.runtime')
$pidDir = Assert-WithinAuraRoot (Join-Path $runtimeDir 'pids')
$logDir = Assert-WithinAuraRoot (Join-Path $root 'logs')
New-Item -ItemType Directory -Force -Path $pidDir, $logDir | Out-Null

$llamaServer = Get-ChildItem -LiteralPath (Join-Path $runtimeDir 'llama.cpp') -Recurse -Filter 'llama-server.exe' | Select-Object -First 1
if (-not $llamaServer) { throw 'llama-server.exe not found. Run scripts/setup-runtime.ps1 first.' }
$modelPath = if ($env:LLM_MODEL_PATH) { Assert-WithinAuraRoot (Join-Path $root $env:LLM_MODEL_PATH) } else { Assert-WithinAuraRoot (Join-Path $root 'models\Qwen3-8B-Q4_K_M.gguf') }
if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) { throw "Model file not found: $modelPath" }
$hostName = if ($env:LLM_SERVER_HOST) { $env:LLM_SERVER_HOST } else { '127.0.0.1' }
if ($hostName -notin @('127.0.0.1', 'localhost')) { throw 'MVP only permits llama-server on loopback.' }
$port = if ($env:LLM_SERVER_PORT) { [int]$env:LLM_SERVER_PORT } else { 8080 }
$context = if ($env:LLM_CONTEXT_SIZE) { [int]$env:LLM_CONTEXT_SIZE } else { 8192 }
$gpuLayers = if ($env:LLM_GPU_LAYERS) { [int]$env:LLM_GPU_LAYERS } else { 99 }

$llamaArgs = @('-m', $modelPath, '--host', $hostName, '--port', "$port", '-c', "$context", '--n-gpu-layers', "$gpuLayers", '--alias', 'aura-local', '--jinja', '-np', '1')
$llama = Start-Process -FilePath $llamaServer.FullName -ArgumentList $llamaArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'llama.out.log') -RedirectStandardError (Join-Path $logDir 'llama.err.log')
Set-Content -LiteralPath (Join-Path $pidDir 'llama.pid') -Value $llama.Id
Wait-HttpReady -Url "http://${hostName}:$port/health" -TimeoutSeconds 180

$web = Start-Process -FilePath 'corepack.exe' -ArgumentList @('pnpm', 'dev') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'web.out.log') -RedirectStandardError (Join-Path $logDir 'web.err.log')
Set-Content -LiteralPath (Join-Path $pidDir 'web.pid') -Value $web.Id
Wait-HttpReady -Url 'http://127.0.0.1:3000/api/status' -TimeoutSeconds 120
Write-Host 'Aura-GPT started: http://127.0.0.1:3000'
