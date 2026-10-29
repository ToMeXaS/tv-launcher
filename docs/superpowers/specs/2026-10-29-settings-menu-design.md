# Launcher settings menu — design

Date: 2026-10-29 · Branch: `tv-launcher`

## Goal

Let the tile row and a few display options be changed from the TV remote, without redeploying:
reorder tiles, hide tiles, add installed apps as tiles (and remove them), set the ambient delay,
toggle the weather card, and reset everything.

## Entry and navigation

- A gear icon sits in the header, immediately left of the clock.
- Focus path upward: tiles → (Up) weather card → (Up) gear. With no weather card shown, Up from
  the tiles goes straight to the gear. Down from the gear returns to the weather card if shown,
  otherwise the tiles. Left/Right on the gear do nothing.
- OK on the gear opens settings. Ambient mode does not start while settings is open.

## Settings screen

Full-screen frosted overlay (same treatment as the 7-day view). Left column lists four sections;
Up/Down moves between rows, Right/OK enters a section, Back goes up one level and, from the
section list, closes settings.

1. **Tiles** — one row per tile in launch order: logo, name, number key (1–9, visible tiles only).
   - OK on a row toggles shown/hidden; hidden rows stay listed, dimmed, with no number.
   - Right on a row focuses its ⇅ handle; OK there picks the tile up. While carried, Up/Down move
     it, and OK or Back drops it. Left returns from the handle to the row.
   - Added (non-built-in) tiles also have a remove button (✕) after the handle, reached with Right.
2. **Add app** — installed apps (`show === true`, excluding the launcher and apps already tiled),
   sorted by name. OK appends the app as a tile at the end and shows a toast.
3. **Display**
   - Ambient after: Off / 1 / 3 / 5 / 10 min (OK cycles).
   - Weather card: On / Off (OK toggles). Off hides the card, its sentence and sun line, and its
     ambient readout; the background still uses sunrise/sunset if data is available.
4. **Reset** — "Reset to defaults"; first OK changes the label to "Press OK again to confirm",
   second OK resets. Moving away cancels the confirmation.

Every change is applied and saved immediately; there is no save button.

## Data

`localStorage` key `settings-v1`:

```js
{
  order: ['hdmi1', 'pc', 'netflix', 'app:xyz.Foo'],  // tile ids, launch order
  hidden: ['twitch'],
  added: { 'app:xyz.Foo': { label: 'Foo', appId: 'xyz.Foo', icon: '/path/icon.png' } },
  ambientMin: 3,   // 0 = off
  weather: true
}
```

- Built-in tiles in `tiles.js` each get a stable `id`; that file stays the defaults.
- Added tile ids are `'app:' + appId`.
- Merge rules (pure, in `logic.js`):
  - start from `order`; drop ids that are neither built-in nor in `added`;
  - append built-ins missing from `order` (new tiles shipped later) at the end;
  - missing/corrupt config, or wrong types, fall back to defaults field by field.
- Number keys and the stored focus index refer to the visible tile list.
- The focused-tile memory moves from an index to a tile id, so reordering does not move focus to a
  different app.

## Installed apps

`TV.listApps(onApps, onError)` wraps `tizen.application.getAppsInfo`, keeps `show === true`,
drops this launcher's own id, returns `{ appId, label, icon }` sorted by label. In a desktop
browser it returns a small fake list so the screen can be previewed. Requires the
`http://tizen.org/privilege/application.info` privilege in `config.xml`.

Added tiles render the app's `iconPath` as an `<img>` on a glass tile; on load error they fall back
to the label's first letter.

## Code layout

- `js/settings.js` — new: settings overlay rendering, its key handling, persistence.
  Exposes `Settings.load()`, `Settings.open(onClose)`, `Settings.isOpen()`, `Settings.key(e)`.
- `js/logic.js` — pure helpers: `mergeTiles`, `moveTile`, `toggleHidden`, `addApp`, `removeApp`,
  `normalizeSettings`.
- `js/main.js` — gear focus, hands keys to `Settings` while open, re-renders tiles and applies
  display options on close; reads ambient delay and weather toggle from settings.
- `js/icons.js` — gear icon. `index.html`/`style.css` — gear, overlay markup and styles.

## Errors

- Storage unavailable: settings work for the session, defaults next launch.
- `getAppsInfo` fails: Add app shows "Couldn't list apps" instead of a list.
- Launching an added app that was since uninstalled: existing launch error toast.

## Testing

- `node:test` cases in `tests/logic.test.js`: merge (order, hidden, unknown ids dropped, new
  built-ins appended, corrupt input), move at both ends, hide/unhide, add (no duplicates) and
  remove, number mapping over visible tiles.
- Browser preview of the overlay with keyboard.
- On the TV after `scripts/deploy.ps1`: gear focus path, reorder + hide reflected on home and
  number keys, add a real app and launch it, ambient delay, weather off, reset.

## Out of scope

Renaming tiles, custom tile colours, choosing background photos, changing weather location.
