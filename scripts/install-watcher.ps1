# Register watcher.py to run hidden at Windows logon (Startup folder shortcut).
$root = Split-Path $PSScriptRoot -Parent
$pythonw = Join-Path (Split-Path (Get-Command python).Source) 'pythonw.exe'
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'TV Launcher Watcher.lnk'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = $pythonw
$sh.Arguments = '"' + (Join-Path $root 'watcher.py') + '" TomLaunch1.Launcher'
$sh.WorkingDirectory = $root
$sh.WindowStyle = 7
$sh.Save()
Start-Process -FilePath $pythonw -ArgumentList $sh.Arguments -WorkingDirectory $root
Write-Output "Installed $lnk and started watcher"
