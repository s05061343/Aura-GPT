param(
    [ValidateSet('all', 'hip', 'vulkan')]
    [string]$Backend = 'all',
    [switch]$SkipModel
)

. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-AuraRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'runtime-manifest.json') | ConvertFrom-Json
$runtimeRoot = Assert-WithinAuraRoot (Join-Path $root '.runtime\llama.cpp')
$downloadDir = Assert-WithinAuraRoot (Join-Path $root '.runtime\downloads')
$modelsDir = Assert-WithinAuraRoot (Join-Path $root 'models')
New-Item -ItemType Directory -Force -Path $runtimeRoot, $downloadDir, $modelsDir | Out-Null

function Get-VerifiedFile([string]$Url, [string]$Destination, [string]$ExpectedSha256) {
    if (-not $ExpectedSha256) { throw "Source did not provide SHA-256; refusing download: $Url" }
    $expected = $ExpectedSha256.ToLowerInvariant()
    if (Test-Path -LiteralPath $Destination) {
        $existing = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($existing -eq $expected) {
            Write-Host "Verified: $([System.IO.Path]::GetFileName($Destination))"
            return
        }
        Write-Warning "Existing file is incomplete or invalid; downloading a verified replacement: $Destination"
    }

    $partial = Assert-WithinAuraRoot "$Destination.partial"
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    try {
        Write-Host "Downloading $Url"
        Invoke-WebRequest -Uri $Url -OutFile $partial -UseBasicParsing
        $actual = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $expected) { throw "SHA-256 mismatch: $partial" }
        Move-Item -LiteralPath $partial -Destination $Destination -Force
    }
    finally {
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    }
    Write-Host "Verified: $([System.IO.Path]::GetFileName($Destination))"
}

$releaseUrl = "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/$($manifest.llamaCpp.tag)"
$release = Invoke-RestMethod -Uri $releaseUrl -Headers @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'Aura-GPT-Setup' }
$backends = if ($Backend -eq 'all') { @('hip', 'vulkan') } else { @($Backend) }
foreach ($backendName in $backends) {
    $backendConfig = $manifest.llamaCpp.backends.$backendName
    if (-not $backendConfig) { throw "Runtime backend is not defined: $backendName" }
    $backendDir = Assert-WithinAuraRoot (Join-Path $runtimeRoot $backendName)
    New-Item -ItemType Directory -Force -Path $backendDir | Out-Null
    foreach ($assetName in $backendConfig.assets) {
        $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
        if (-not $asset) { throw "llama.cpp release asset not found: $assetName" }
        $digest = [string]$asset.digest
        $expected = if ($digest.StartsWith('sha256:')) { $digest.Substring(7) } else { $digest }
        $zipPath = Assert-WithinAuraRoot (Join-Path $downloadDir $assetName)
        Get-VerifiedFile -Url $asset.browser_download_url -Destination $zipPath -ExpectedSha256 $expected
        Expand-Archive -LiteralPath $zipPath -DestinationPath $backendDir -Force
    }
    Write-Host "Prepared llama.cpp backend: $backendName"
}

if (-not $SkipModel) {
    $repo = $manifest.model.repository
    $revision = $manifest.model.revision
    $file = $manifest.model.file
    # Delimit interpolated values explicitly: Windows PowerShell 5.1 otherwise
    # treats the query suffix as part of the revision variable expression.
    $encodedRepo = [System.Uri]::EscapeUriString([string]$repo)
    $encodedRevision = [System.Uri]::EscapeDataString([string]$revision)
    $treeUrl = "https://huggingface.co/api/models/${encodedRepo}/tree/${encodedRevision}?recursive=true&expand=false"
    $tree = Invoke-RestMethod -Uri $treeUrl -Headers @{ 'User-Agent' = 'Aura-GPT-Setup' }
    $modelEntry = $tree | Where-Object { $_.path -eq $file } | Select-Object -First 1
    if (-not $modelEntry -or -not $modelEntry.lfs.oid) { throw "Model file or SHA-256 not found: $repo/$file" }
    $modelUrl = "https://huggingface.co/$repo/resolve/$revision/$file"
    $modelPath = Assert-WithinAuraRoot (Join-Path $modelsDir $file)
    Get-VerifiedFile -Url $modelUrl -Destination $modelPath -ExpectedSha256 ([string]$modelEntry.lfs.oid)

    $manifestHash = (Get-FileHash -LiteralPath (Join-Path $root 'runtime-manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    $setupMarker = Assert-WithinAuraRoot (Join-Path $root '.runtime\setup-complete.json')
    @{
        manifestSha256 = $manifestHash
        completedAt = [DateTime]::UtcNow.ToString('o')
        modelSha256 = ([string]$modelEntry.lfs.oid).ToLowerInvariant()
    } | ConvertTo-Json | Set-Content -LiteralPath $setupMarker -Encoding UTF8
}

Write-Host 'Aura-GPT runtime setup completed.'
