# TV Launcher — Design

Date: 2026-10-29
Target: Samsung UE55CU8072UXXH (Tizen, 2023), 192.168.0.147, developer mode → this PC.

## Goal

A fast, ad-free start screen for the TV that opens automatically on power-on and launches the user's
apps and inputs in one press.

## Scope

In: one screen with photo background, greeting, clock, date, detailed weather (Šiauliai) and seven tiles;
remote navigation; auto-launch on power-on.
Out: replacing Samsung's Home button (impossible on Tizen), Live TV / Browser tiles, recommendations,
settings/gallery/weather sub-screens.

## Tech

Plain Tizen web app: `index.html`, `style.css`, `main.js`, `config.xml`, `icon.png`, `bg/*.jpg` (icons are inline SVG in `js/icons.js`).
No framework, no build step.
Packaged and signed with the existing Tizen Studio CLI (`C:\tizen-studio`) and Samsung certificate
(`%USERPROFILE%\SamsungCertificate\TV`), installed over `sdb` (192.168.0.147:26101).

## Screen

Modelled on the user's reference mockup. 1920×1080 layout over a full-bleed landscape photo, with a dark
gradient over the lower/left area for legibility. Text in white.

- Top bar: "✳ Home" label at left; clock (HH:MM, 24h) at right. No icon buttons (dropped from mockup).
- Left block (lower half):
  - Date, uppercase, letter-spaced (e.g. "WEDNESDAY, 29 OCTOBER").
  - Large greeting by local time: "Good morning." 05–12, "Good afternoon." 12–18, "Good evening." 18–23,
    "Good night." otherwise.
  - One-line weather sentence from the current weather code (e.g. "Clear skies and sunshine.").
  - "Sunset at HH:MM" before today's sunset, "Sunrise at HH:MM" (tomorrow's) after it, with icon.
- Weather card (right, frosted-glass panel): condition icon, current temperature, condition name, today's H/L;
  "Feels X° · Wind X km/h · Humidity X%"; next 6 hours as time / icon / temperature columns.
  - Up from the tiles focuses the card (white outline, "OK · 7-day forecast" hint); Down/Left/Right go back.
  - OK opens a full-screen week view: one column per day from today (name, date, icon, condition, high,
    low, rain chance). Back or OK closes it.
- Bottom: one row of seven equal tiles: **HDMI 1 · PC (HDMI 2) · Netflix · Stremio · Twitch · YouTube · Moonlight**.
  - App tiles show a hand-drawn SVG of the app's logo on its brand colour, label underneath
    (the TV refuses `sdb pull` of its icon store, so real icon files are not available).
  - Input tiles are translucent glass with an HDMI-port icon and label.
  - Focused tile: white outline and slight scale-up.

Weather icons are inline SVGs (sun, cloud, sun+cloud, rain, snow, fog, thunder, moon variants at night).

## Backgrounds

About 10 free-licence (Unsplash) landscape photos, resized to 1920×1080 JPEG (~400 KB each), bundled in the
app so they load instantly with no network. Photo of the day = day-of-year mod count.

## Input handling

- Left/Right: move focus (no wrap-around).
- Enter: activate focused tile.
- Back (Return): swallowed — launcher never exits itself.
- Focused tile index is saved in `localStorage` and restored on launch / when the app regains visibility.

## Tile actions

- App tiles: `tizen.application.launch(appId)`. App IDs read from the TV during implementation and stored
  in a single tiles array in `main.js`.
- Input tiles (HDMI 1, PC): shown inside the launcher, full screen, via `tizen.tvwindow.setSource()` +
  `tizen.tvwindow.show()` (verified working on this TV in a spike, 2026-10-29). While an input is shown the
  launcher UI is hidden; Back hides the TV window and returns to the tiles. Leaving the app (Home) also hides it.
  Real source switching from inside the app is not possible: the TV's local remote API rejects the app
  (port 8001 times out, 8002 fails TLS). Known trade-off, accepted by the user: possible extra input lag and
  no Game Mode on the PC input.

## Weather

Open-Meteo forecast API (no key), Šiauliai 55.93 N, 23.31 E, timezone Europe/Vilnius: current temperature,
apparent temperature, humidity, wind speed, weather code, is_day; hourly temperature + weather code; daily
max/min, sunrise, sunset, weather code, max precipitation probability; 7 forecast days. Refresh every 30 min. Last good result cached in `localStorage` and rendered immediately on start.
On failure with no cache, the weather card, weather sentence and sunset line are hidden; greeting, date,
clock and tiles still render.

## Auto-launch on power-on

- TV: Settings → Advanced Features → Start Screen Options → Autorun Last App = on (backup).
- PC: `watcher.py <launcher app id>` registered to start hidden at Windows logon.
- The watcher launches via REST `POST http://<tv>:8001/api/v2/applications/<id>` and debounces power-state
  polls: the TV counts as off only after 5 consecutive not-on polls (or an explicit standby), so a single
  failed poll never relaunches the launcher over a running app. Events are logged to `watcher.log`.

## Testing

1. Layout/navigation in a desktop browser (arrow keys, Enter, Backspace as Back).
2. On the TV via camera: each tile opens the right thing.
   Known platform limitation: Back inside Netflix/Twitch/Stremio/YouTube does not return to the launcher
   (those apps handle Back themselves). Workaround: pin "Home" first in Smart Hub's app row.
3. Power-cycle the TV: launcher appears automatically (watcher), and again with the PC off (Autorun Last App).

## Order of work

1. Spike: input switching from a web app.
2. Build launcher.
3. Package, sign, install.
4. Auto-launch setup.
5. On-TV verification.
