# TV Launcher

A custom home screen (Tizen web app) for a Samsung TV (UE55CU8072UXXH): photo background, clock, weather
for Šiauliai and tiles for Netflix, Twitch, Stremio, YouTube, Moonlight and HDMI inputs. A PC-side watcher relaunches
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

## Using it

Left/Right pick a tile, OK opens it, or press 1-9 to open a visible tile directly. Focus starts on the last tile opened.
Up focuses the weather card; OK there shows the 7-day forecast, Back closes it. Up again focuses the gear next to
the clock; OK opens Settings. After the ambient delay (3 idle minutes by default) only the photo, a big clock and the
temperature stay up; any key brings the rest back.

## Settings

- **Tiles**: OK shows/hides a tile. Right then OK picks it up, Up/Down move it, OK drops it. Apps you added have a
  remove button after the move handle.
- **Add app**: lists apps installed on the TV that don't have a tile yet; OK adds one at the end. Only regular installed apps are listed (system apps, and a few Samsung apps like SmartThings, are left out).
- **Display**: ambient delay (Off, 1, 3, 5, 10 min), the weather card on/off, and the background (Alone, the PC's Wallpaper Engine scene as moving 30 s loops that follow the time of day: morning 04-09, day 09-17, dusk 17-20, night 20-04; or the rotating day/night photos).
  The loops in `launcher/bg/alone/` are recorded from Wallpaper Engine with `powershell -ExecutionPolicy Bypass -File scripts/record-wallpaper.ps1`
  (needs ffmpeg; keep the mouse still for ~5 min; it raises Wallpaper Engine's FPS limit while recording and restores it after).
  Ambient delay and Background are dropdowns: OK opens the list, Up/Down chooses, OK selects, Back cancels. OK flips the weather card.
- **Reset**: OK twice restores the default tiles and display options.

Settings are stored on the TV (`localStorage`, key `settings-v1`).

## Customising

- Built-in tiles and app ids: `launcher/js/tiles.js` (tile `id`s are stored in settings; don't rename them)
- Background photos: `launcher/bg/` by day, `launcher/bg/night/` between sunset and sunrise (fetched by `scripts/fetch-backgrounds.py`)

## Tests

    node --test tests/*.test.js
    python -m unittest discover -s tests -p "test_*.py"

## Helper tools

`cam.py` (camera snapshot of the TV), `remote.py` (send TV remote keys). `token.txt` holds the TV pairing
token: keep it private, never commit it.
