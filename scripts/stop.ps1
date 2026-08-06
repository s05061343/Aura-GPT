. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-AuraRoot
$pidDir = Assert-WithinAuraRoot (Join-Path $root '.runtime\pids')
foreach ($name in @('web', 'llama')) {
    $pidPath = Join-Path $pidDir "$name.pid"
    if (-not (Test-Path -LiteralPath $pidPath)) { continue }
    $processId = [int](Get-Content -Raw -LiteralPath $pidPath)
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $processId
        Write-Host "Stopped $name (PID $processId)"
    }
    Remove-Item -LiteralPath $pidPath
}
$activeBackendPath = Assert-WithinAuraRoot (Join-Path $root '.runtime\active-backend.txt')
if (Test-Path -LiteralPath $activeBackendPath) { Remove-Item -LiteralPath $activeBackendPath }
