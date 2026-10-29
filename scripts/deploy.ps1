# Package, sign (profile "TV"), install and launch the launcher on the TV.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$tizen = 'C:\tizen-studio\tools\ide\bin\tizen.bat'
$sdb = 'C:\tizen-studio\tools\sdb.exe'
$target = 'UE55CU8072UXXH'
$build = Join-Path $root 'build'

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
Copy-Item -Recurse (Join-Path $root 'launcher') $build
& $tizen package -t wgt -s TV -- $build
$wgt = Get-ChildItem $build -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { throw 'packaging produced no .wgt' }
& $sdb connect 192.168.0.147 | Out-Null
& $tizen install -n $wgt.FullName -t $target
& $tizen run -p TomLaunch1.Launcher -t $target
