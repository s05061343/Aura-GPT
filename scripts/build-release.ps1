. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-JunyxRoot
Set-Location -LiteralPath $root

$python = Join-Path $root '.runtime\toolchains\python\python.exe'
$go = Join-Path $root '.runtime\toolchains\go\bin\go.exe'
$pipZipapp = Join-Path $root '.runtime\downloads\pip.pyz'
$webSource = Assert-WithinJunyxRoot (Join-Path $root 'out')
$webTarget = Assert-WithinJunyxRoot (Join-Path $root 'desktop\web')
$exeTarget = Assert-WithinJunyxRoot (Join-Path $root 'JUNYX.exe')
$iconSource = Assert-WithinJunyxRoot (Join-Path $root 'desktop\assets\junyx.ico')
$windowsResource = Assert-WithinJunyxRoot (Join-Path $root 'desktop\junyx.syso')

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Python toolchain not found: $python" }
if (-not (Test-Path -LiteralPath $go -PathType Leaf)) { throw "Go toolchain not found: $go" }

& corepack pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
& corepack pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Static UI build failed.' }

if (-not (Test-Path -LiteralPath $pipZipapp -PathType Leaf)) { throw "PyPA pip zipapp not found: $pipZipapp" }
& $python $pipZipapp install -r (Join-Path $root 'backend\requirements.lock')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
$env:PYTHONPATH = Join-Path $root 'backend'
& $python -m pytest (Join-Path $root 'backend\tests')
if ($LASTEXITCODE -ne 0) { throw 'Python tests failed.' }

$resolvedTarget = [System.IO.Path]::GetFullPath($webTarget)
$expectedTarget = [System.IO.Path]::GetFullPath((Join-Path $root 'desktop\web'))
if (-not $resolvedTarget.Equals($expectedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace unexpected web target: $resolvedTarget"
}
Get-ChildItem -LiteralPath $webTarget -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne 'placeholder.txt' } |
    Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $webSource '*') -Destination $webTarget -Recurse -Force

Push-Location (Join-Path $root 'desktop')
try {
    & $go run 'github.com/akavel/rsrc@v0.10.2' -arch amd64 -ico $iconSource -o $windowsResource
    if ($LASTEXITCODE -ne 0) { throw 'Windows icon resource generation failed.' }
    & $go test ./...
    if ($LASTEXITCODE -ne 0) { throw 'Go tests failed.' }
    & $go build -trimpath -ldflags '-s -w -H=windowsgui' -o $exeTarget .
    if ($LASTEXITCODE -ne 0) { throw 'JUNYX.exe build failed.' }
}
finally {
    Pop-Location
}

Write-Host "Built: $exeTarget"
