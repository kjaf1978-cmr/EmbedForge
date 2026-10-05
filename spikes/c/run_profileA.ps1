# Phase 0 (c) spike - full Profile A benchmark. Needs about 35 GB free disk and several hours.
# Usage: .\run_profileA.ps1            (CPU)    or   .\run_profileA.ps1 -Ngl 99   (GPU build, all layers on GPU)
param([int]$Ngl = 0)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$server = (Get-ChildItem (Join-Path $PSScriptRoot "llama") -Recurse -Filter "llama-server.exe" | Select-Object -First 1).FullName
if (-not $server) { throw "Run .\setup_windows.ps1 first" }
python fetch_models.py --set A
python bench.py --profile A --server-bin $server --set A --ngl $Ngl
python bench.py --profile A --server-bin $server --models qwen3-4b,qwen3-8b --no-grammar --ngl $Ngl
Compress-Archive -Force results "results-profileA-$(Get-Date -Format yyyyMMdd).zip"
Write-Host "Done. Send me results-profileA-*.zip"
