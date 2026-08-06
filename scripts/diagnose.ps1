. (Join-Path $PSScriptRoot 'common.ps1')
Read-DotEnv
$root = Get-AuraRoot
Write-Host "Workspace: $root"
Write-Host "Node: $(node --version 2>$null)"
Write-Host "pnpm: $(corepack pnpm --version 2>$null)"
$runtimeRoot = Join-Path $root '.runtime\llama.cpp'
$rocmBin = Enable-RocmRuntime
Write-Host "ROCm runtime: $(if ($rocmBin) { $rocmBin } else { 'not found' })"
foreach ($backendName in @('hip', 'vulkan')) {
    $server = Get-ChildItem -LiteralPath (Join-Path $runtimeRoot $backendName) -Recurse -Filter 'llama-server.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Host "llama-server ($backendName): $(if ($server) { $server.FullName } else { 'missing' })"
    $devices = if ($server) { @(Get-LlamaDevices -ServerPath $server.FullName) } else { @() }
    Write-Host "llama devices ($backendName): $(if ($devices.Count -gt 0) { $devices -join '; ' } else { 'none detected' })"
}
$model = Join-Path $root 'models\Qwen3-8B-Q4_K_M.gguf'
Write-Host "Model: $(if (Test-Path -LiteralPath $model) { (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash } else { 'missing' })"
$amdGpu = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'AMD|Radeon' } | Select-Object -ExpandProperty Name
Write-Host "AMD GPU: $(if ($amdGpu) { $amdGpu -join '; ' } else { 'not detected' })"
$rocminfo = Get-Command 'rocminfo.exe' -ErrorAction SilentlyContinue
if ($rocminfo) {
    $targets = & $rocminfo.Source 2>$null | Select-String -Pattern 'gfx[0-9]+' | ForEach-Object { $_.Matches.Value } | Select-Object -Unique
    Write-Host "ROCm/HIP targets: $(if ($targets) { $targets -join ', ' } else { 'runtime found; no gfx target reported' })"
} else {
    Write-Host 'ROCm/HIP tools: rocminfo unavailable (the packaged HIP backend may still run)'
}
$activeBackendPath = Join-Path $root '.runtime\active-backend.txt'
Write-Host "Active backend: $(if (Test-Path -LiteralPath $activeBackendPath) { (Get-Content -Raw -LiteralPath $activeBackendPath).Trim() } else { 'not started' })"
try { $status = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 3; Write-Host "Application: $($status | ConvertTo-Json -Compress)" } catch { Write-Host 'Application: unavailable' }
Write-Host "LangSmith: $(if ($env:LANGSMITH_API_KEY) { 'enabled (key redacted)' } else { 'local fallback' })"
