$ErrorActionPreference = 'Stop'

function Get-AuraRoot {
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
}

function Assert-WithinAuraRoot([string]$Path) {
    $root = Get-AuraRoot
    $resolved = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside the Aura-GPT workspace: $resolved"
    }
    return $resolved
}

function Read-DotEnv {
    $root = Get-AuraRoot
    $envPath = Join-Path $root '.env'
    if (-not (Test-Path -LiteralPath $envPath)) { return }
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim().Trim('"').Trim("'")
        if ($name -match '^[A-Za-z_][A-Za-z0-9_]*$') {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

function Get-LlamaDevices([string]$ServerPath) {
    if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) { return @() }
    $output = @(& $ServerPath --list-devices 2>&1 | ForEach-Object { "$_" })
    if ($LASTEXITCODE -ne 0) { return @() }
    return @($output | Where-Object { $_ -match '^\s+\S+:\s+.+$' } | ForEach-Object { $_.Trim() })
}

function Get-RocmBin {
    $candidates = @()
    if ($env:ROCM_PATH) { $candidates += (Join-Path $env:ROCM_PATH 'bin') }
    $rocmRoot = Join-Path $env:ProgramFiles 'AMD\ROCm'
    if (Test-Path -LiteralPath $rocmRoot -PathType Container) {
        $candidates += Get-ChildItem -LiteralPath $rocmRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object { try { [version]$_.Name } catch { [version]'0.0' } } -Descending |
            ForEach-Object { Join-Path $_.FullName 'bin' }
    }
    return $candidates |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'amdhip64_7.dll') -PathType Leaf } |
        Select-Object -First 1
}

function Enable-RocmRuntime {
    $rocmBin = Get-RocmBin
    if (-not $rocmBin) { return $null }
    $pathEntries = @($env:Path -split ';' | Where-Object { $_ })
    if ($rocmBin -notin $pathEntries) { $env:Path = "$rocmBin;$env:Path" }
    return $rocmBin
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds = 120) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch { Start-Sleep -Seconds 1 }
    }
    throw "Timed out waiting for service: $Url"
}

function Wait-ProcessHttpReady(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 120
) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) {
            throw "Process exited before becoming ready (exit code $($Process.ExitCode)): $Url"
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
        } catch { Start-Sleep -Seconds 1 }
    }
    throw "Timed out waiting for service: $Url"
}
