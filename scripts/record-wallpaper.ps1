# Run with: powershell -ExecutionPolicy Bypass -File scripts/record-wallpaper.ps1
# Records the "Alone" Wallpaper Engine scene's four looks (morning, day, dusk, night) as seamless 30 s loops
# in launcher/bg/alone/. Keep the mouse still while it runs: the scene's camera follows the cursor.
# Wallpaper Engine renders no faster than its global FPS limit, so the script raises that for the recording,
# restarting Wallpaper Engine, and puts the original config back afterwards.
param([string[]]$Periods = @('morning', 'day', 'dusk', 'night'), [int]$Fps = 30)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$we = 'C:\Program Files (x86)\Steam\steamapps\common\wallpaper_engine\wallpaper64.exe'
$weConfig = Join-Path (Split-Path $we) 'config.json'
$scene = 'C:\Program Files (x86)\Steam\steamapps\workshop\content\431960\3448877775\project.json'
$out = Join-Path $root 'launcher\bg\alone'
$tmp = Join-Path $root 'build\record'
$title = 'AloneRec'
$display = @{ morning = 0; day = 1; dusk = 2; night = 3 } # the scene's "Time period selection" values

$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg not found (winget install Gyan.FFmpeg)' }
if (-not (Test-Path $we)) { throw "Wallpaper Engine not found at $we" }
if (-not (Test-Path $scene)) { throw "Alone wallpaper not found at $scene (subscribe to workshop item 3448877775)" }

Add-Type -AssemblyName System.Windows.Forms

function Restart-WallpaperEngine {
  Get-Process wallpaper64 -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 2
  Start-Process $we
  Start-Sleep 8 # let it load the desktop wallpapers
}

function Set-SceneProps($props) {
  $json = ConvertTo-Json $props -Compress
  & $we -control applyProperties -wallpaper $scene -properties "RAW~($json)~END"
}

New-Item -ItemType Directory -Force $out, $tmp | Out-Null
$configBackup = Join-Path $env:TEMP 'wallpaper-engine-config.json.bak' # outside build/, which deploy.ps1 wipes
Copy-Item $weConfig $configBackup -Force
$config = [IO.File]::ReadAllText($weConfig)
if ($config -notmatch '"fps" : \d+,') { throw "no fps setting found in $weConfig" }

try {
  [IO.File]::WriteAllText($weConfig, ($config -replace '"fps" : \d+,', "`"fps`" : $Fps,"))
  Restart-WallpaperEngine

  & $we -control openWallpaper -file $scene -playInWindow $title -width 1920 -height 1080 -x 0 -y 0
  $hwnd = 0
  for ($i = 0; $i -lt 30 -and -not $hwnd; $i++) {
    Start-Sleep -Milliseconds 500
    $p = Get-Process wallpaper64 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq $title }
    if ($p) { $hwnd = $p.MainWindowHandle }
  }
  if (-not $hwnd) { throw 'Wallpaper Engine did not open the recording window' }

  foreach ($period in $Periods) {
    # Widgets, audio bars, mouse trail and parallax off; fixed time period instead of the clock.
    Set-SceneProps @{ brgeneralcomponentswitch = $false; tiao = $false; newproperty61 = $false; shu = $false
      hrbigb3 = $false; tishi = 2; timevarying = 2; display = $display[$period] }
    Start-Sleep 5 # let the period's lights fade in

    for ($try = 1; ; $try++) {
      Write-Host "Recording $period (try $try)..."
      $raw = Join-Path $tmp "$period-raw.mkv"
      $cursor = [System.Windows.Forms.Cursor]::Position
      ffmpeg -hide_banner -loglevel error -y -filter_complex "gfxcapture=hwnd=$($hwnd):capture_cursor=0:max_framerate=$($Fps),hwdownload,format=bgra,fps=$Fps" `
        -t 36 -c:v libx264 -preset veryfast -crf 12 -pix_fmt yuv420p $raw
      if ($LASTEXITCODE -ne 0) { throw "capture failed for $period" }
      if ([System.Windows.Forms.Cursor]::Position -eq $cursor) { break }
      if ($try -eq 3) { Write-Warning "mouse moved while recording $period; the loop may show a camera shift"; break }
      Write-Host 'Mouse moved, recording again'
    }

    # Skip 4 s of warm-up, keep 32 s, then crossfade its last 2 s into its first 2 s: the 30 s result ends on
    # the frame it starts with, so looping it has no jump.
    ffmpeg -hide_banner -loglevel error -y -i $raw -filter_complex (
      '[0:v]trim=4:36,setpts=PTS-STARTPTS,split[a][b];' +
      '[a]trim=2:32,setpts=PTS-STARTPTS[m];[b]trim=0:2,setpts=PTS-STARTPTS[h];' +
      '[m][h]xfade=transition=fade:duration=2:offset=28[v]') -map '[v]' `
      -c:v libx264 -preset slow -crf 20 -profile:v high -level 4.2 -pix_fmt yuv420p -g ($Fps * 2) -an -movflags +faststart (Join-Path $out "$period.mp4")
    if ($LASTEXITCODE -ne 0) { throw "encoding failed for $period" }
    Remove-Item $raw
  }
} finally {
  # Restarting with the original config also drops the recording window and any property overrides.
  Get-Process wallpaper64 -ErrorAction SilentlyContinue | Stop-Process -Force
  Copy-Item $configBackup $weConfig -Force
  Restart-WallpaperEngine
}
Get-ChildItem $out -Filter *.mp4 | ForEach-Object { '{0}  {1:N1} MB' -f $_.Name, ($_.Length / 1MB) }
