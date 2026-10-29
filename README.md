# TV Launcher

A custom home screen (Tizen web app) for a Samsung TV (UE55CU8072UXXH): photo background, clock, weather
for Šiauliai and tiles for Netflix, Twitch, Stremio, YouTube and HDMI inputs. A PC-side watcher relaunches
it whenever the TV powers on. Design: `docs/superpowers/specs/2026-10-29-tv-launcher-design.md`.

## Deploy / redeploy

    powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1

Should end with "successfully launched".

## Auto-launch watcher

Install or reinstall (registers a Startup shortcut, restarts the watcher):

    powershell -ExecutionPolicy Bypass -File scripts/install-watcher.ps1

Log: `watcher.log`. Also set the TV to Settings -> Advanced Features -> Start Screen Options ->
Autorun Last App (backup for when the PC is off).

## Uninstall

- `C:\tizen-studio\tools\ide\bin\tizen.bat uninstall -p TomLaunch1.Launcher -t UE55CU8072UXXH`
- Delete `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TV Launcher Watcher.lnk`
- Stop the `pythonw.exe` process running `watcher.py`.

## Known limitation

Pressing Back inside Netflix/Twitch/Stremio/YouTube does not return to the launcher (those apps handle
Back themselves). Workaround: pin "Home" as the first app in Smart Hub's app row.

## Customising

- Tiles and app ids: `launcher/js/tiles.js`
- Background photos: `launcher/bg/` (fetched by `scripts/fetch-backgrounds.py`)

## Tests

    node --test tests/*.test.js
    python -m unittest discover -s tests -p "test_*.py"

## Helper tools

`cam.py` (camera snapshot of the TV), `remote.py` (send TV remote keys). `token.txt` holds the TV pairing
token: keep it private, never commit it.
