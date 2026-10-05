# Phase 0 (c) spike - Profile A (Windows) setup: downloads the latest llama.cpp release build.
# Usage (PowerShell, in this folder):  .\setup_windows.ps1            (CPU build)
#                                      .\setup_windows.ps1 -Gpu vulkan (if you have a supported GPU)
param([ValidateSet("cpu","vulkan","cuda")][string]$Gpu = "cpu")
$ErrorActionPreference = "Stop"
try { python --version } catch { Write-Host "Python not found - installing"; winget install --id Python.Python.3.12 -e; Write-Host "Close and reopen PowerShell, then run this script again."; exit 1 }
$rel = Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
$pat = @{ cpu = 'bin-win-cpu-x64\.zip$'; vulkan = 'bin-win-vulkan-x64\.zip$'; cuda = 'bin-win-cuda-12[\d.]*-x64\.zip$' }[$Gpu]
$asset = $rel.assets | Where-Object { $_.name -match $pat } | Select-Object -First 1
if (-not $asset) { $rel.assets.name; throw "No asset matching $pat in $($rel.tag_name) - send me this list." }
$dest = Join-Path $PSScriptRoot "llama"
New-Item -ItemType Directory -Force $dest | Out-Null
$zip = Join-Path $dest $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $zip
Expand-Archive $zip -DestinationPath $dest -Force
if ($Gpu -eq "cuda") {
  $rt = $rel.assets | Where-Object { $_.name -match '^cudart-.*win.*cuda-12.*x64\.zip$' } | Select-Object -First 1
  if ($rt) { $z2 = Join-Path $dest $rt.name; Invoke-WebRequest $rt.browser_download_url -OutFile $z2; Expand-Archive $z2 -DestinationPath $dest -Force }
}
$server = Get-ChildItem $dest -Recurse -Filter "llama-server.exe" | Select-Object -First 1
"$($rel.tag_name) $($asset.name)" | Set-Content (Join-Path $dest "VERSION.txt")
Write-Host "llama.cpp $($rel.tag_name) ready: $($server.FullName)"
