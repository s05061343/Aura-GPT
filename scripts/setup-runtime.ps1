param([switch]$SkipModel)

. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-AuraRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $root 'runtime-manifest.json') | ConvertFrom-Json
$runtimeDir = Assert-WithinAuraRoot (Join-Path $root '.runtime\llama.cpp')
$downloadDir = Assert-WithinAuraRoot (Join-Path $root '.runtime\downloads')
$modelsDir = Assert-WithinAuraRoot (Join-Path $root 'models')
New-Item -ItemType Directory -Force -Path $runtimeDir, $downloadDir, $modelsDir | Out-Null

function Get-VerifiedFile([string]$Url, [string]$Destination, [string]$ExpectedSha256) {
    if (-not $ExpectedSha256) { throw "Source did not provide SHA-256; refusing download: $Url" }
    if (-not (Test-Path -LiteralPath $Destination)) {
        Write-Host "Downloading $Url"
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    $actual = (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "SHA-256 mismatch: $Destination"
    }
    Write-Host "Verified: $([System.IO.Path]::GetFileName($Destination))"
}

$releaseUrl = "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/$($manifest.llamaCpp.tag)"
$release = Invoke-RestMethod -Uri $releaseUrl -Headers @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'Aura-GPT-Setup' }
foreach ($assetName in $manifest.llamaCpp.assets) {
    $asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
    if (-not $asset) { throw "llama.cpp release asset not found: $assetName" }
    $digest = [string]$asset.digest
    $expected = if ($digest.StartsWith('sha256:')) { $digest.Substring(7) } else { $digest }
    $zipPath = Assert-WithinAuraRoot (Join-Path $downloadDir $assetName)
    Get-VerifiedFile -Url $asset.browser_download_url -Destination $zipPath -ExpectedSha256 $expected
    Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeDir -Force
}

if (-not $SkipModel) {
    $repo = $manifest.model.repository
    $revision = $manifest.model.revision
    $file = $manifest.model.file
    $treeUrl = "https://huggingface.co/api/models/$repo/tree/$revision?recursive=true&expand=false"
    $tree = Invoke-RestMethod -Uri $treeUrl -Headers @{ 'User-Agent' = 'Aura-GPT-Setup' }
    $modelEntry = $tree | Where-Object { $_.path -eq $file } | Select-Object -First 1
    if (-not $modelEntry -or -not $modelEntry.lfs.oid) { throw "Model file or SHA-256 not found: $repo/$file" }
    $modelUrl = "https://huggingface.co/$repo/resolve/$revision/$file"
    $modelPath = Assert-WithinAuraRoot (Join-Path $modelsDir $file)
    Get-VerifiedFile -Url $modelUrl -Destination $modelPath -ExpectedSha256 ([string]$modelEntry.lfs.oid)
}

Write-Host 'Aura-GPT runtime setup completed.'
