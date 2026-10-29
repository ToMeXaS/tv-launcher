# Run with: powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
# Package, sign (profile "TV"), install and launch the launcher on the TV.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tizen = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
$sdb = 'C:\tizen-studio\tools\sdb.exe'
$target = 'UE55CU8072UXXH'
$build = Join-Path $root 'build'

if (-not (Test-Path $tizen)) { throw "tizen.bat not found at $tizen (install Tizen Studio CLI)" }
if (-not (Test-Path $sdb)) { throw "sdb.exe not found at $sdb (install Tizen Studio)" }

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
Copy-Item -Recurse (Join-Path $root 'launcher') $build

& $tizen package -t wgt -s TV -- $build
if ($LASTEXITCODE -ne 0) { throw "tizen package failed (exit $LASTEXITCODE)" }
$wgt = Get-ChildItem $build -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { throw 'packaging produced no .wgt' }

$out = (& $sdb connect 192.168.0.147 | Out-String)
Write-Host $out
if ($LASTEXITCODE -ne 0 -or $out -notmatch 'connected') { throw "sdb connect failed: $out" }

$out = (& $tizen install -n $wgt.FullName -t $target | Out-String)
Write-Host $out
if ($LASTEXITCODE -ne 0 -or $out -notmatch 'successfully installed') { throw 'tizen install failed' }

$out = (& $tizen run -p TomLaunch1.Launcher -t $target | Out-String)
Write-Host $out
if ($LASTEXITCODE -ne 0 -or $out -notmatch 'successfully launched') { throw 'tizen run failed' }
