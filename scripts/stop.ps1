. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-JunyxRoot
$pidDir = Assert-WithinJunyxRoot (Join-Path $root '.runtime\pids')
foreach ($name in @('web', 'web-launcher', 'llama')) {
    $pidPath = Join-Path $pidDir "$name.pid"
    if (-not (Test-Path -LiteralPath $pidPath)) { continue }
    $pidValue = (Get-Content -Raw -LiteralPath $pidPath).Trim()
    if ($pidValue -notmatch '^\d+$' -or [int64]$pidValue -gt [int]::MaxValue) {
        throw "Invalid PID file: $pidPath"
    }
    $processId = [int]$pidValue
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $processId -Force
        $stopDeadline = [DateTime]::UtcNow.AddSeconds(10)
        while ((Get-Process -Id $processId -ErrorAction SilentlyContinue) -and
            [DateTime]::UtcNow -lt $stopDeadline) {
            Start-Sleep -Milliseconds 100
        }
        if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
            throw "Failed to stop $name (PID $processId)."
        }
        Write-Host "Stopped $name (PID $processId)"
    }
    Remove-Item -LiteralPath $pidPath
}
$activeBackendPath = Assert-WithinJunyxRoot (Join-Path $root '.runtime\active-backend.txt')
if (Test-Path -LiteralPath $activeBackendPath) { Remove-Item -LiteralPath $activeBackendPath }
