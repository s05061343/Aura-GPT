. (Join-Path $PSScriptRoot 'common.ps1')
Read-DotEnv
$root = Get-AuraRoot
Write-Host "Workspace: $root"
Write-Host "Node: $(node --version 2>$null)"
Write-Host "pnpm: $(corepack pnpm --version 2>$null)"
$server = Get-ChildItem -LiteralPath (Join-Path $root '.runtime\llama.cpp') -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host "llama-server: $(if ($server) { $server.FullName } else { 'missing' })"
$model = Join-Path $root 'models\Qwen3-8B-Q4_K_M.gguf'
Write-Host "Model: $(if (Test-Path -LiteralPath $model) { (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash } else { 'missing' })"
try { $gpu = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>$null; Write-Host "GPU: $gpu" } catch { Write-Host 'GPU: nvidia-smi unavailable' }
try { $status = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 3; Write-Host "Application: $($status | ConvertTo-Json -Compress)" } catch { Write-Host 'Application: unavailable' }
Write-Host "LangSmith: $(if ($env:LANGSMITH_API_KEY) { 'enabled (key redacted)' } else { 'local fallback' })"
