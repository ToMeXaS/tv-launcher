# Launcher Settings Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A settings overlay, opened from a gear next to the clock, to reorder/hide tiles, add/remove installed apps as tiles, set the ambient delay, toggle the weather card and reset to defaults.

**Architecture:** Pure settings helpers in `launcher/js/logic.js` (normalize, merge, move, hide, add, remove) with `node:test` coverage. A new `launcher/js/settings.js` owns the overlay, its key handling and `localStorage` persistence. `launcher/js/main.js` builds the tile row from the settings, adds the gear to the focus path, and hands keys to `Settings` while it is open.

**Tech Stack:** Tizen web app, plain ES5 JavaScript (no build step, no modules in the browser), CSS, `node --test` for the pure logic.

**Spec:** `docs/superpowers/specs/2026-10-29-settings-menu-design.md`

## Global Constraints

- ES5 only in `launcher/` (`var`, `function`, no arrow functions/`let`/template strings): the existing code style. Tests in `tests/` may use modern Node syntax.
- Screen is a fixed 1920×1080 canvas; remote keys: Up 38, Down 40, Left 37, Right 39, OK 13, Back 10009 (Backspace 8 / Escape 27 in a desktop browser).
- `localStorage` key for settings: `settings-v1`. Focused tile is remembered by id under `focus-id`.
- Added tile ids are `'app:' + appId`. Built-in tile ids: `hdmi1`, `pc`, `netflix`, `stremio`, `twitch`, `youtube`, `moonlight`.
- Ambient choices: Off / 1 / 3 / 5 / 10 minutes, default 3. Weather card default On.
- Every `localStorage` access is wrapped in try/catch.
- At least one tile always stays visible.
- New privilege: `http://tizen.org/privilege/application.info`.
- Run tests: `node --test tests/*.test.js` (baseline: 20 passing).

## Precondition

The working tree has uncommitted launcher work (ambient mode, number keys, night photos). Commit it as its own
commit before Task 1 so the settings commits stay separate. Ask the user before committing it.

## File Structure

- `launcher/js/logic.js` — modify: add settings helpers.
- `launcher/js/tiles.js` — modify: add a stable `id` to each built-in tile.
- `launcher/js/icons.js` — modify: gear, move and remove icons; `tileLogo(t)` for built-in and added tiles.
- `launcher/js/tv.js` — modify: `listApps`.
- `launcher/js/settings.js` — create: overlay, keys, persistence.
- `launcher/js/main.js` — modify: tiles from settings, gear focus zone, ambient/weather options.
- `launcher/index.html`, `launcher/style.css`, `launcher/config.xml` — modify.
- `tests/logic.test.js` — modify.
- `README.md` — modify.

---

### Task 1: Settings logic

**Files:**
- Modify: `launcher/js/logic.js` (add functions before `var Logic = {`, extend the export object)
- Modify: `launcher/js/tiles.js`
- Test: `tests/logic.test.js` (append)

**Interfaces:**
- Produces (all on `Logic`, all pure, never mutate their inputs; "unchanged" means the same object is returned):
  - `normalizeSettings(raw, builtins) -> Settings` where `Settings = { order: string[], hidden: string[], added: { [id]: { label, appId, icon } }, ambientMin: number, weather: boolean }`
  - `allTiles(s, builtins) -> Tile[]` — every tile in order; built-ins copied with `hidden` added; added apps as `{ id, label, appId, icon, added: true, glass: true, hidden }`
  - `visibleTiles(s, builtins) -> Tile[]`
  - `moveTile(s, id, dir) -> Settings` (dir -1/+1; unchanged at the ends)
  - `toggleHidden(s, id) -> Settings` (unchanged if it would hide the last visible tile)
  - `addApp(s, { appId, label, icon }) -> Settings` (unchanged if already added)
  - `removeApp(s, id) -> Settings` (unchanged for built-ins or if it would leave no visible tile)
  - `availableApps(apps, s, builtins) -> apps` without already-tiled appIds, sorted by label, case-insensitive
  - `nextAmbient(min) -> number`, `setOption(s, key, value) -> Settings`, `escapeHtml(str) -> string`

- [ ] **Step 1: Write the failing tests** — append to `tests/logic.test.js`:

```js
const B = [
  { id: 'hdmi1', label: 'HDMI 1', input: 1 },
  { id: 'netflix', label: 'Netflix', appId: 'org.tizen.netflix-app' },
  { id: 'youtube', label: 'YouTube', appId: 'yt' }
];

test('normalizeSettings gives defaults for missing or corrupt input', () => {
  for (const raw of [null, 'x', 42, [], {}]) {
    assert.deepStrictEqual(Logic.normalizeSettings(raw, B),
      { order: ['hdmi1', 'netflix', 'youtube'], hidden: [], added: {}, ambientMin: 3, weather: true });
  }
});

test('normalizeSettings keeps saved order, drops unknown ids and appends new built-ins', () => {
  const s = Logic.normalizeSettings({ order: ['youtube', 'gone', 'hdmi1', 'youtube'], hidden: ['gone', 'hdmi1'] }, B);
  assert.deepStrictEqual(s.order, ['youtube', 'hdmi1', 'netflix']);
  assert.deepStrictEqual(s.hidden, ['hdmi1']);
});

test('normalizeSettings keeps valid added apps and rejects malformed ones', () => {
  const s = Logic.normalizeSettings({
    order: ['app:foo', 'hdmi1'],
    added: {
      'app:foo': { label: 'Foo', appId: 'foo', icon: 'file:///foo.png' },
      'app:bar': { label: 'Bar' },
      'app:x': { label: 'X', appId: 'y' }
    },
    ambientMin: 7, weather: 'no'
  }, B);
  assert.deepStrictEqual(s.added, { 'app:foo': { label: 'Foo', appId: 'foo', icon: 'file:///foo.png' } });
  assert.deepStrictEqual(s.order, ['app:foo', 'hdmi1', 'netflix', 'youtube']);
  assert.strictEqual(s.ambientMin, 3);
  assert.strictEqual(s.weather, true);
});

test('normalizeSettings keeps valid display options and never hides every tile', () => {
  const s = Logic.normalizeSettings({ ambientMin: 0, weather: false, hidden: ['hdmi1', 'netflix', 'youtube'] }, B);
  assert.strictEqual(s.ambientMin, 0);
  assert.strictEqual(s.weather, false);
  assert.deepStrictEqual(s.hidden, []);
});

test('allTiles and visibleTiles build tiles in order with hidden flags', () => {
  let s = Logic.normalizeSettings({ order: ['youtube', 'hdmi1', 'netflix'], hidden: ['hdmi1'] }, B);
  s = Logic.addApp(s, { appId: 'foo', label: 'Foo', icon: '' });
  const all = Logic.allTiles(s, B);
  assert.deepStrictEqual(all.map(t => [t.id, t.hidden]),
    [['youtube', false], ['hdmi1', true], ['netflix', false], ['app:foo', false]]);
  assert.deepStrictEqual(all[3], { id: 'app:foo', label: 'Foo', appId: 'foo', icon: '', added: true, glass: true, hidden: false });
  assert.deepStrictEqual(Logic.visibleTiles(s, B).map(t => t.id), ['youtube', 'netflix', 'app:foo']);
  assert.strictEqual(B[1].hidden, undefined); // built-ins are copied, not changed
});

test('moveTile swaps with the neighbour and stops at both ends', () => {
  const s = Logic.normalizeSettings(null, B);
  assert.deepStrictEqual(Logic.moveTile(s, 'netflix', -1).order, ['netflix', 'hdmi1', 'youtube']);
  assert.deepStrictEqual(Logic.moveTile(s, 'netflix', 1).order, ['hdmi1', 'youtube', 'netflix']);
  assert.strictEqual(Logic.moveTile(s, 'hdmi1', -1), s);
  assert.strictEqual(Logic.moveTile(s, 'youtube', 1), s);
  assert.deepStrictEqual(s.order, ['hdmi1', 'netflix', 'youtube']);
});

test('toggleHidden hides and shows, but never the last visible tile', () => {
  const s = Logic.normalizeSettings(null, B);
  const a = Logic.toggleHidden(s, 'netflix');
  assert.deepStrictEqual(a.hidden, ['netflix']);
  assert.deepStrictEqual(Logic.toggleHidden(a, 'netflix').hidden, []);
  const b = Logic.toggleHidden(a, 'hdmi1');
  assert.strictEqual(Logic.toggleHidden(b, 'youtube'), b);
  assert.deepStrictEqual(s.hidden, []);
});

test('addApp appends once; removeApp drops only added apps', () => {
  const s = Logic.normalizeSettings(null, B);
  const a = Logic.addApp(s, { appId: 'foo', label: 'Foo', icon: 'i.png' });
  assert.deepStrictEqual(a.order, ['hdmi1', 'netflix', 'youtube', 'app:foo']);
  assert.deepStrictEqual(a.added['app:foo'], { label: 'Foo', appId: 'foo', icon: 'i.png' });
  assert.strictEqual(Logic.addApp(a, { appId: 'foo', label: 'Foo' }), a);
  const r = Logic.removeApp(Logic.toggleHidden(a, 'app:foo'), 'app:foo');
  assert.deepStrictEqual(r.order, ['hdmi1', 'netflix', 'youtube']);
  assert.deepStrictEqual(r.hidden, []);
  assert.deepStrictEqual(r.added, {});
  assert.strictEqual(Logic.removeApp(a, 'netflix'), a);
  assert.deepStrictEqual(s.added, {});
});

test('removeApp refuses to remove the last visible tile', () => {
  let s = Logic.addApp(Logic.normalizeSettings(null, B), { appId: 'foo', label: 'Foo' });
  s = Logic.toggleHidden(Logic.toggleHidden(Logic.toggleHidden(s, 'hdmi1'), 'netflix'), 'youtube');
  assert.deepStrictEqual(s.hidden, ['hdmi1', 'netflix', 'youtube']);
  assert.strictEqual(Logic.removeApp(s, 'app:foo'), s);
});

test('availableApps drops apps that already have a tile and sorts by name', () => {
  const s = Logic.toggleHidden(Logic.normalizeSettings(null, B), 'youtube'); // hidden still counts as tiled
  const apps = [{ appId: 'z', label: 'zattoo' }, { appId: 'yt', label: 'YouTube' }, { appId: 'a', label: 'Apple TV' }];
  assert.deepStrictEqual(Logic.availableApps(apps, s, B).map(a => a.appId), ['a', 'z']);
});

test('nextAmbient cycles Off, 1, 3, 5, 10 minutes', () => {
  assert.deepStrictEqual([0, 1, 3, 5, 10, 7].map(Logic.nextAmbient), [1, 3, 5, 10, 0, 0]);
});

test('setOption returns a changed copy', () => {
  const s = Logic.normalizeSettings(null, B);
  assert.strictEqual(Logic.setOption(s, 'weather', false).weather, false);
  assert.strictEqual(s.weather, true);
});

test('escapeHtml escapes markup characters', () => {
  assert.strictEqual(Logic.escapeHtml('<a href="x">Tom & Jerry\'s</a>'),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/*.test.js`
Expected: the 13 new tests FAIL with `TypeError: Logic.normalizeSettings is not a function` (and similar); the 20 existing tests pass.

- [ ] **Step 3: Implement** — in `launcher/js/logic.js`, insert before `var Logic = {`:

```js
  var AMBIENT_CHOICES = [0, 1, 3, 5, 10]; // minutes; 0 = never

  function copyOf(o) {
    var r = {};
    for (var k in o) r[k] = o[k];
    return r;
  }

  function setOption(s, key, value) {
    var r = copyOf(s);
    r[key] = value;
    return r;
  }

  // Saved settings checked field by field against the built-in tiles; anything missing or malformed takes its default.
  function normalizeSettings(raw, builtins) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var src = s.added && typeof s.added === 'object' ? s.added : {};
    var added = {};
    Object.keys(src).forEach(function (id) {
      var a = src[id];
      if (a && typeof a.label === 'string' && typeof a.appId === 'string' && id === 'app:' + a.appId) {
        added[id] = { label: a.label, appId: a.appId, icon: typeof a.icon === 'string' ? a.icon : '' };
      }
    });
    var known = builtins.map(function (t) { return t.id; }).concat(Object.keys(added));
    var order = [];
    (Array.isArray(s.order) ? s.order : []).concat(known).forEach(function (id) {
      if (known.indexOf(id) !== -1 && order.indexOf(id) === -1) order.push(id);
    });
    var hidden = [];
    (Array.isArray(s.hidden) ? s.hidden : []).forEach(function (id) {
      if (order.indexOf(id) !== -1 && hidden.indexOf(id) === -1) hidden.push(id);
    });
    if (hidden.length === order.length) hidden = [];
    return {
      order: order,
      hidden: hidden,
      added: added,
      ambientMin: AMBIENT_CHOICES.indexOf(s.ambientMin) !== -1 ? s.ambientMin : 3,
      weather: typeof s.weather === 'boolean' ? s.weather : true
    };
  }

  function builtinById(builtins, id) {
    for (var i = 0; i < builtins.length; i++) if (builtins[i].id === id) return builtins[i];
    return null;
  }

  // Every tile in launch order: built-ins copied, added apps made into glass tiles, each with a hidden flag.
  function allTiles(s, builtins) {
    return s.order.map(function (id) {
      var b = builtinById(builtins, id), a = s.added[id];
      var t = b ? copyOf(b) : { id: id, label: a.label, appId: a.appId, icon: a.icon, added: true, glass: true };
      t.hidden = s.hidden.indexOf(id) !== -1;
      return t;
    });
  }

  function visibleTiles(s, builtins) {
    return allTiles(s, builtins).filter(function (t) { return !t.hidden; });
  }

  function moveTile(s, id, dir) {
    var order = s.order.slice(), i = order.indexOf(id), j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return s;
    order[i] = order[j];
    order[j] = id;
    return setOption(s, 'order', order);
  }

  // Unchanged when hiding would leave no tile on the home screen.
  function toggleHidden(s, id) {
    if (s.hidden.indexOf(id) !== -1) return setOption(s, 'hidden', s.hidden.filter(function (h) { return h !== id; }));
    if (s.hidden.length + 1 >= s.order.length) return s;
    return setOption(s, 'hidden', s.hidden.concat([id]));
  }

  function addApp(s, app) {
    var id = 'app:' + app.appId;
    if (s.order.indexOf(id) !== -1) return s;
    var added = copyOf(s.added);
    added[id] = { label: app.label, appId: app.appId, icon: app.icon || '' };
    return setOption(setOption(s, 'added', added), 'order', s.order.concat([id]));
  }

  // Only added apps can be removed; unchanged when it is the last visible tile.
  function removeApp(s, id) {
    if (!s.added[id]) return s;
    var hidden = s.hidden.filter(function (h) { return h !== id; });
    if (hidden.length >= s.order.length - 1) return s;
    var added = copyOf(s.added);
    delete added[id];
    var r = setOption(s, 'added', added);
    r.order = s.order.filter(function (o) { return o !== id; });
    r.hidden = hidden;
    return r;
  }

  // Installed apps that have no tile yet (hidden tiles count as tiles), sorted by name.
  function availableApps(apps, s, builtins) {
    var tiled = allTiles(s, builtins).map(function (t) { return t.appId; });
    return apps.filter(function (a) { return tiled.indexOf(a.appId) === -1; }).sort(function (a, b) {
      var x = a.label.toLowerCase(), y = b.label.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  function nextAmbient(min) {
    return AMBIENT_CHOICES[(AMBIENT_CHOICES.indexOf(min) + 1) % AMBIENT_CHOICES.length];
  }

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }
```

Replace the export object with:

```js
  var Logic = {
    formatTime: formatTime, formatDate: formatDate, greeting: greeting,
    moveFocus: moveFocus, numberTile: numberTile, photoIndex: photoIndex, parseLocal: parseLocal,
    weatherInfo: weatherInfo, todayIndex: todayIndex, sunLine: sunLine, isNight: isNight, nextHours: nextHours, weatherView: weatherView,
    weekView: weekView,
    normalizeSettings: normalizeSettings, allTiles: allTiles, visibleTiles: visibleTiles, moveTile: moveTile,
    toggleHidden: toggleHidden, addApp: addApp, removeApp: removeApp, availableApps: availableApps,
    nextAmbient: nextAmbient, setOption: setOption, escapeHtml: escapeHtml
  };
```

Replace `launcher/js/tiles.js` with (same tiles, ids added):

```js
// Built-in tiles and their default order. Ids are stored in settings: never rename one.
var TILES = [
  { id: 'hdmi1', label: 'HDMI 1', logo: 'hdmi', input: 1, glass: true },
  { id: 'pc', label: 'PC', logo: 'hdmi', input: 2, glass: true },
  { id: 'netflix', label: 'Netflix', logo: 'netflix', appId: 'org.tizen.netflix-app', bg: '#000000' },
  { id: 'stremio', label: 'Stremio', logo: 'stremio', appId: 'IkWsFHtOY9.Stremio', bg: '#1E1640' },
  { id: 'twitch', label: 'Twitch', logo: 'twitch', appId: 'Jz7aUrV2Q4.Twitch', bg: '#9146FF' },
  { id: 'youtube', label: 'YouTube', logo: 'youtube', appId: '9Ur5IzDKqV.TizenYouTube', bg: '#FFFFFF', light: true },
  { id: 'moonlight', label: 'Moonlight', logo: 'moonlight', appId: 'MoonLightS.MoonlightWasm', bg: '#14213A' }
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/*.test.js`
Expected: 33 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
git add launcher/js/logic.js launcher/js/tiles.js tests/logic.test.js
git commit -m "feat(launcher): settings logic for tile order, hiding and added apps"
```

---

### Task 2: Settings overlay (icons, app list, settings.js, markup, styles)

**Files:**
- Modify: `launcher/js/icons.js`
- Modify: `launcher/js/tv.js`
- Modify: `launcher/config.xml`
- Create: `launcher/js/settings.js`
- Modify: `launcher/index.html`
- Modify: `launcher/style.css`

**Interfaces:**
- Consumes: Task 1 `Logic.*` helpers; global `TILES`.
- Produces:
  - `Icons.gear`, `Icons.move`, `Icons.remove` (SVG strings), `Icons.tileLogo(tile) -> html` (built-in: its SVG; added: `<img>` with first-letter fallback)
  - `TV.listApps(onApps(list), onError(msg))`, list items `{ appId, label, icon }`
  - `Settings.load()`, `Settings.get() -> Settings`, `Settings.open(onClose)`, `Settings.isOpen() -> boolean`, `Settings.key(keyCode)`
  - DOM: `#gear` in the header, `#settings` overlay with `#s-nav`, `#s-panel`, `#s-hint`; `html.settings-open` class while open; `body.weather-off` class (set by main in Task 3) hides `.wx`.

- [ ] **Step 1: Icons** — in `launcher/js/icons.js`, replace the final `return { weather: weather, sun: sunsetIcon, app: app };` with:

```js
  var gear = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round">' +
    '<circle cx="32" cy="32" r="9"/><circle cx="32" cy="32" r="19"/>' +
    '<path d="M32 4v9M32 51v9M4 32h9M51 32h9M12.2 12.2l6.4 6.4M45.4 45.4l6.4 6.4M12.2 51.8l6.4-6.4M45.4 18.6l6.4-6.4"/></g></svg>';
  var move = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 6l13 16H19zM32 58L19 42h26z" fill="#fff"/></svg>';
  var remove = '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M18 18l28 28M46 18L18 46" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>';

  // Built-in tiles use their drawn logo; added apps use the TV's icon, or their first letter when it won't load.
  function tileLogo(t) {
    if (!t.added) return app[t.logo];
    var letter = '<span class="letter"' + (t.icon ? ' style="display:none"' : '') + '>' +
      Logic.escapeHtml(t.label.charAt(0).toUpperCase()) + '</span>';
    if (!t.icon) return letter;
    return '<img src="' + Logic.escapeHtml(t.icon) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'\'">' + letter;
  }

  return { weather: weather, sun: sunsetIcon, app: app, gear: gear, move: move, remove: remove, tileLogo: tileLogo };
```

- [ ] **Step 2: App list** — in `launcher/js/tv.js`, add before `return {`:

```js
  // Apps shown in the TV's app list, minus this launcher: [{ appId, label, icon }].
  function listApps(onApps, onError) {
    if (!hasTizen) {
      onApps([
        { appId: 'demo.Spotify', label: 'Spotify', icon: '' },
        { appId: 'demo.Plex', label: 'Plex', icon: 'missing.png' }, // exercises the letter fallback
        { appId: 'org.tizen.netflix-app', label: 'Netflix', icon: '' } // already a tile, so not listed
      ]);
      return;
    }
    try {
      var self = tizen.application.getCurrentApplication().appInfo.id;
      tizen.application.getAppsInfo(function (list) {
        onApps(list.filter(function (a) { return a.show && a.id !== self; }).map(function (a) {
          var icon = a.iconPath || '';
          return { appId: a.id, label: a.name || a.id, icon: icon.charAt(0) === '/' ? 'file://' + icon : icon };
        }));
      }, function (e) { onError(e.message); });
    } catch (e) { onError(e.message || String(e)); }
  }
```

and change the return line to:

```js
  return { launchApp: launchApp, showInput: showInput, hideInput: hideInput, registerNumberKeys: registerNumberKeys, listApps: listApps };
```

In `launcher/config.xml`, after the `application.launch` privilege line add:

```xml
    <tizen:privilege name="http://tizen.org/privilege/application.info"/>
```

- [ ] **Step 3: Create `launcher/js/settings.js`**

```js
var Settings = (function () {
  'use strict';
  var KEY = 'settings-v1';
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var SECTIONS = ['Tiles', 'Add app', 'Display', 'Reset'];
  var s = null; // current settings, always normalized
  var shown = false;
  var onClose = null;
  var level = 0; // 0: section list, 1: inside the section
  var sec = 0;
  var row = 0;
  var col = 0; // Tiles rows: 0 the row, 1 move handle, 2 remove button (added apps only)
  var carrying = false;
  var apps = null; // installed apps, fetched the first time Add app is entered
  var appsError = false;
  var confirmReset = false;
  var note = ''; // one-off message in the hint line, cleared by the next key

  function $(id) { return document.getElementById(id); }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none or unreadable */ }
    s = Logic.normalizeSettings(raw, TILES);
  }

  function get() { return s; }

  function save(next) {
    s = next;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable: lasts this session */ }
  }

  function tileRows() { return Logic.allTiles(s, TILES); }
  function appRows() { return apps ? Logic.availableApps(apps, s, TILES) : []; }
  function rowCount() { return [tileRows().length, appRows().length, 2, 1][sec]; }
  function maxCol() { return sec !== 0 ? 0 : tileRows()[row].added ? 2 : 1; }

  function open(cb) {
    onClose = cb;
    shown = true;
    level = sec = row = col = 0;
    carrying = confirmReset = appsError = false;
    apps = null;
    note = '';
    document.documentElement.classList.add('settings-open');
    render();
  }

  function close() {
    shown = false;
    document.documentElement.classList.remove('settings-open');
    onClose();
  }

  function isOpen() { return shown; }

  function enter() {
    level = 1;
    row = col = 0;
    confirmReset = false;
    if (sec === 1 && !apps && !appsError) {
      TV.listApps(function (list) { apps = list; render(); }, function () { appsError = true; render(); });
    }
  }

  function carry(dir) {
    var id = tileRows()[row].id;
    save(Logic.moveTile(s, id, dir));
    row = s.order.indexOf(id);
  }

  function press() {
    var next;
    if (sec === 0) {
      var t = tileRows()[row];
      if (col === 1) { carrying = true; return; }
      next = col === 2 ? Logic.removeApp(s, t.id) : Logic.toggleHidden(s, t.id);
      if (next === s) { note = 'At least one tile has to stay visible'; return; }
      save(next);
      if (col === 2) { row = Math.min(row, rowCount() - 1); col = 0; note = 'Removed ' + t.label; }
    } else if (sec === 1) {
      var a = appRows()[row];
      if (!a) return;
      save(Logic.addApp(s, a));
      row = Math.max(0, Math.min(row, rowCount() - 1));
      note = 'Added ' + a.label;
    } else if (sec === 2) {
      save(row === 0 ? Logic.setOption(s, 'ambientMin', Logic.nextAmbient(s.ambientMin)) : Logic.setOption(s, 'weather', !s.weather));
    } else if (!confirmReset) {
      confirmReset = true;
    } else {
      save(Logic.normalizeSettings(null, TILES));
      confirmReset = false;
      note = 'Back to defaults';
    }
  }

  function key(k) {
    var isBack = BACK.indexOf(k) !== -1;
    var dir = k === 38 ? -1 : k === 40 ? 1 : 0;
    note = '';
    if (level === 0) {
      if (isBack) { close(); return; }
      if (dir) sec = Logic.moveFocus(sec, dir, SECTIONS.length);
      else if (k === 39 || k === 13) enter();
    } else if (carrying) {
      if (dir) carry(dir);
      else if (k === 13 || isBack) carrying = false;
    } else if (isBack || (k === 37 && col === 0)) {
      level = 0;
      confirmReset = false;
    } else if (dir) {
      if (rowCount()) row = Logic.moveFocus(row, dir, rowCount());
      col = 0;
      confirmReset = false;
    } else if (k === 37) col--;
    else if (k === 39) col = Math.min(col + 1, maxCol());
    else if (k === 13) press();
    render();
  }

  function rowFocused(i) { return level === 1 && i === row; }

  function tilesPanel() {
    var n = 0;
    return tileRows().map(function (t, i) {
      var f = rowFocused(i);
      var num = t.hidden ? '' : ++n <= 9 ? String(n) : '';
      return '<div class="srow' + (t.hidden ? ' off' : '') + (f && col === 0 ? ' focused' : '') + (f && carrying ? ' carrying' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo(t) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(t.label) + '</span>' +
        '<span class="s-num">' + num + '</span>' +
        '<span class="s-value">' + (t.hidden ? 'Hidden' : 'Shown') + '</span>' +
        '<span class="s-btn' + (f && col === 1 ? ' focused' : '') + '">' + Icons.move + '</span>' +
        (t.added ? '<span class="s-btn' + (f && col === 2 ? ' focused' : '') + '">' + Icons.remove + '</span>' : '<span class="s-btn blank"></span>') +
        '</div>';
    }).join('');
  }

  function appsPanel() {
    if (appsError) return '<div class="s-msg">Couldn\'t list apps</div>';
    if (!apps) return '<div class="s-msg">' + (level === 1 ? 'Loading apps…' : 'Apps installed on this TV') + '</div>';
    var list = appRows();
    if (!list.length) return '<div class="s-msg">Every installed app already has a tile</div>';
    return list.map(function (a, i) {
      return '<div class="srow' + (rowFocused(i) ? ' focused' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo({ added: true, label: a.label, icon: a.icon }) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(a.label) + '</span><span class="s-value">Add</span></div>';
    }).join('');
  }

  function displayPanel() {
    return [
      ['Ambient screen after', s.ambientMin ? s.ambientMin + ' min' : 'Off'],
      ['Weather card', s.weather ? 'On' : 'Off']
    ].map(function (r, i) {
      return '<div class="srow' + (rowFocused(i) ? ' focused' : '') + '"><span class="s-name">' + r[0] + '</span>' +
        '<span class="s-value">' + r[1] + '</span></div>';
    }).join('');
  }

  function resetPanel() {
    return '<div class="srow' + (rowFocused(0) ? ' focused' : '') + '"><span class="s-name">' +
      (confirmReset ? 'Press OK again to confirm' : 'Reset tiles and display to defaults') + '</span></div>';
  }

  function hint() {
    if (level === 0) return 'OK · open    Back · close';
    if (carrying) return 'Up / Down · move    OK · drop';
    if (sec !== 0) return 'OK · select    Back · sections';
    if (col === 0) return 'OK · show / hide    Right · move';
    if (col === 1) return 'OK · pick up' + (maxCol() === 2 ? '    Right · remove' : '');
    return 'OK · remove';
  }

  // Scrolls the panel just enough to show the focused row, focus ring included.
  function keepInView(panel) {
    var el = panel.querySelector('.focused');
    if (!el) { panel.scrollTop = 0; return; }
    if (!el.classList.contains('srow')) el = el.parentNode;
    var top = el.offsetTop - 8, bottom = el.offsetTop + el.offsetHeight + 8;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }

  function render() {
    $('s-nav').innerHTML = SECTIONS.map(function (name, i) {
      return '<div class="snav' + (i === sec ? ' active' : '') + (level === 0 && i === sec ? ' focused' : '') + '">' + name + '</div>';
    }).join('');
    $('s-panel').innerHTML = [tilesPanel, appsPanel, displayPanel, resetPanel][sec]();
    $('s-hint').textContent = note || hint();
    keepInView($('s-panel'));
  }

  return { load: load, get: get, open: open, isOpen: isOpen, key: key };
})();
```

- [ ] **Step 4: Markup** — in `launcher/index.html`:

Replace the header line with:

```html
    <header><div class="brand">&#10035; Home</div><div class="hdr-right"><div id="gear"></div><div id="clock"></div></div></header>
```

After the closing `</section>` of `#week`, add:

```html
    <section id="settings">
      <h2>Settings</h2>
      <div id="s-nav"></div>
      <div id="s-panel"></div>
      <div id="s-hint" class="hint"></div>
    </section>
```

Add `<script src="js/settings.js"></script>` between the `weather.js` and `main.js` script tags.

- [ ] **Step 5: Styles** — append to `launcher/style.css`:

```css
.hdr-right { display: flex; align-items: center; gap: 28px; }
#gear { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: .8; transition: transform .15s ease-out; }
#gear svg { width: 36px; height: 36px; display: block; }
#gear.focused { opacity: 1; background: rgba(255,255,255,.15); box-shadow: 0 0 0 4px #fff; transform: scale(1.1); }
.tile .logo img { height: 96px; width: auto; display: block; margin-top: -20px; }
.tile .logo .letter { display: block; font-size: 84px; font-weight: 600; margin-top: -20px; }
#settings {
  display: none; position: absolute; inset: 0;
  background: rgba(8,12,18,.7); backdrop-filter: blur(24px);
}
#settings h2 { position: absolute; left: 120px; top: 100px; margin: 0; font-size: 44px; font-weight: 400; }
#s-nav { position: absolute; left: 120px; top: 220px; width: 340px; }
.snav { font-size: 30px; padding: 18px 26px; border-radius: 12px; margin-bottom: 10px; opacity: .6; }
.snav.active { opacity: 1; background: rgba(255,255,255,.08); }
.snav.focused { box-shadow: 0 0 0 4px #fff; }
#s-panel { position: absolute; left: 520px; right: 114px; top: 212px; bottom: 170px; padding: 8px 6px; overflow: hidden; }
.srow {
  display: flex; align-items: center; gap: 24px; height: 76px; padding: 0 24px; margin-bottom: 12px;
  border-radius: 12px; font-size: 28px; background: rgba(255,255,255,.06);
}
.srow.focused { box-shadow: 0 0 0 4px #fff; }
.srow.off .s-logo, .srow.off .s-name, .srow.off .s-value { opacity: .4; }
.srow.carrying { background: rgba(124,196,255,.25); box-shadow: 0 0 0 4px #7CC4FF; }
.s-logo { width: 72px; height: 48px; display: flex; align-items: center; justify-content: center; }
.s-logo svg, .s-logo img { max-width: 72px; max-height: 44px; display: block; }
.s-logo .letter { font-size: 34px; font-weight: 600; }
.s-name { flex: 1; }
.s-num { width: 30px; text-align: center; font-size: 24px; opacity: .6; }
.s-value { font-size: 24px; opacity: .75; }
.s-btn { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.1); }
.s-btn.blank { background: none; }
.s-btn svg { width: 26px; height: 26px; display: block; }
.s-btn.focused { box-shadow: 0 0 0 4px #fff; background: rgba(255,255,255,.2); }
.s-msg { font-size: 28px; opacity: .7; padding: 18px 24px; }
#settings .hint { position: absolute; left: 0; right: 0; bottom: 80px; text-align: center; font-size: 22px; opacity: .7; }
html.settings-open #settings { display: block; }
html.settings-open header, html.settings-open .hero, html.settings-open .card, html.settings-open #tiles { visibility: hidden; }
body.weather-off .wx { display: none; }
```

- [ ] **Step 6: Preview the overlay in a desktop browser**

Open `launcher/index.html` in Chrome (file://). In DevTools console run:

```js
Settings.load(); Settings.open(function () { console.log('closed', JSON.stringify(Settings.get())); });
```

Then drive it with the keyboard by dispatching keys: in the console, `function k(c){Settings.key(c)}`, then `k(39)` (enter Tiles), `k(40)`, `k(13)` (hide PC), `k(39)`, `k(13)`, `k(40)`, `k(13)` (pick up, move down, drop), `k(8)`, `k(40)`, `k(39)` (Add app: Plex and Spotify listed, Netflix not; Plex shows the letter "P"), `k(13)` (adds Plex), `k(8)`, `k(8)` (closes; logs settings).
Expected: rows, focus rings and hint text update at each step; the logged settings show `pc` hidden, the moved order and `app:demo.Plex` added; no console errors. (Main still ignores these settings until Task 3; the home screen keyboard handling also still runs, which is fine for this check.)

- [ ] **Step 7: Run tests**

Run: `node --test tests/*.test.js`
Expected: 33 PASS.

- [ ] **Step 8: Commit**

```bash
git add launcher/js/icons.js launcher/js/tv.js launcher/config.xml launcher/js/settings.js launcher/index.html launcher/style.css
git commit -m "feat(launcher): settings overlay for tiles, installed apps and display options"
```

---

### Task 3: Wire settings into the home screen

**Files:**
- Modify: `launcher/js/main.js`

**Interfaces:**
- Consumes: `Settings.load/get/open/isOpen/key`, `Logic.visibleTiles`, `Logic.escapeHtml`, `Icons.tileLogo`, `Icons.gear`, `#gear`, `body.weather-off`.
- Produces: final behaviour; nothing consumed by later tasks.

Behaviour changes, all in `main.js`:
- `tiles` (visible tiles from settings) replaces direct use of `TILES`.
- Focus zones replace `weatherFocused`: `zone` is `'tiles'`, `'weather'` or `'gear'`.
- Focus is remembered by tile id (`focus-id`), so reordering keeps the same app focused.
- Ambient delay comes from `settings.ambientMin` (0 = never) and never starts while settings is open.
- Weather off: `body.weather-off`, and Up skips the card.

- [ ] **Step 1: Replace the top of the file through `updateFocus`** — replace everything from `(function () {` down to and including the closing `}` of `updateFocus()` with:

```js
(function () {
  'use strict';
  var BG_COUNT = 10;
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var tiles = []; // visible tiles in launch order
  var focus = 0;
  var zone = 'tiles'; // 'tiles', 'weather' (Up from the tiles) or 'gear' (Up again)
  var settings = null;
  var inputMode = false;
  var pendingInput = false;
  var root = document.documentElement;
  var weatherData = null;
  var bgUrl = '';
  var weatherAt = 0;
  var WEATHER_MAX_AGE = 12 * 3600 * 1000;
  var WEATHER_REFRESH = 30 * 60 * 1000;
  var inputRequest = 0;
  var weekOpen = false;
  var lastKey = Date.now();
  var ambient = false;

  function $(id) { return document.getElementById(id); }

  function savedFocusId() {
    try { return localStorage.getItem('focus-id'); } catch (e) { return null; } // storage unavailable
  }

  function saveFocus() {
    try { localStorage.setItem('focus-id', tiles[focus].id); } catch (e) { /* storage unavailable */ }
  }

  function weatherShown() { return !!weatherData && settings.weather; }

  // Rebuilds the tile row from the settings, keeping focus on the same app when it is still shown.
  function applySettings() {
    var id = tiles.length ? tiles[focus].id : savedFocusId();
    settings = Settings.get();
    tiles = Logic.visibleTiles(settings, TILES);
    focus = 0;
    for (var i = 0; i < tiles.length; i++) if (tiles[i].id === id) focus = i;
    document.body.classList.toggle('weather-off', !settings.weather);
    if (zone === 'weather' && !weatherShown()) zone = 'tiles';
    renderTiles();
  }

  function renderTiles() {
    var row = $('tiles');
    row.innerHTML = '';
    tiles.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tile' + (t.glass ? ' glass' : '') + (t.light ? ' light' : '');
      if (t.bg) el.style.background = t.bg;
      el.innerHTML = '<div class="logo">' + Icons.tileLogo(t) + '</div><div class="label">' + Logic.escapeHtml(t.label) + '</div>' +
        (i < 9 ? '<div class="num">' + (i + 1) + '</div>' : '');
      row.appendChild(el);
    });
    updateFocus();
  }

  function updateFocus() {
    var els = $('tiles').children;
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', zone === 'tiles' && i === focus);
    $('weather').classList.toggle('focused', zone === 'weather');
    $('gear').classList.toggle('focused', zone === 'gear');
  }
```

- [ ] **Step 2: Ambient condition in `tick()`** — replace the `if (!ambient && ...) enterAmbient();` line with:

```js
    if (!ambient && settings.ambientMin && !inputMode && !pendingInput && !Settings.isOpen() && !document.hidden &&
      Date.now() - lastKey > settings.ambientMin * 60 * 1000) enterAmbient();
```

- [ ] **Step 3: `dropWeatherFocus`** — replace the function body line `if (weatherFocused) { weatherFocused = false; updateFocus(); }` with:

```js
    if (zone === 'weather') { zone = 'tiles'; updateFocus(); }
```

- [ ] **Step 4: `activate` and settings opener** — in `activate()`, change `var t = TILES[focus];` to `var t = tiles[focus];`. Then add after `activate()`:

```js
  function openSettings() {
    Settings.open(applySettings);
  }
```

- [ ] **Step 5: Key handling** — in the `keydown` listener, replace everything from the `var n = Logic.numberTile(k, TILES.length);` line to the end of the `else if (k === 13) ...` line with:

```js
    if (Settings.isOpen()) { Settings.key(k); return; }
    var n = Logic.numberTile(k, tiles.length);
    if (n !== -1) { focus = n; zone = 'tiles'; updateFocus(); activate(); return; }
    if (k === 38) { zone = zone === 'tiles' && weatherShown() ? 'weather' : 'gear'; updateFocus(); }
    else if (k === 40) { zone = zone === 'gear' && weatherShown() ? 'weather' : 'tiles'; updateFocus(); }
    else if (zone === 'gear') { if (k === 13) openSettings(); }
    else if (zone === 'weather') {
      if (k === 13) openWeek();
      else if (k === 37 || k === 39) { zone = 'tiles'; updateFocus(); }
    }
    else if (k === 37) { focus = Logic.moveFocus(focus, -1, tiles.length); updateFocus(); }
    else if (k === 39) { focus = Logic.moveFocus(focus, 1, tiles.length); updateFocus(); }
    else if (k === 13) activate();
```

- [ ] **Step 6: Startup** — replace the lines

```js
  TV.registerNumberKeys();
  focus = loadFocus();
  renderTiles();
```

with:

```js
  TV.registerNumberKeys();
  $('gear').innerHTML = Icons.gear;
  Settings.load();
  applySettings();
```

- [ ] **Step 7: Check no stale names remain**

Run: `grep -n "weatherFocused\|loadFocus\|AMBIENT_AFTER\|TILES\[" launcher/js/main.js`
Expected: no output.

- [ ] **Step 8: Run tests**

Run: `node --test tests/*.test.js`
Expected: 33 PASS.

- [ ] **Step 9: Browser check** — reload `launcher/index.html` in Chrome, clear site data first (DevTools → Application → Clear storage). Using the keyboard:
  - Up → weather card (only if weather loaded), Up → gear ringed, Down → back down; with weather unavailable, Up from tiles goes straight to the gear.
  - OK on the gear opens Settings. Hide PC, move Netflix to the front, add Plex, set ambient to 1 min, weather Off, Back twice.
  - Home now shows Netflix first, no PC, a "P" Plex tile at the end, no weather card, and number badges 1..N with no gaps. Pressing `2` launches the second visible tile (console logs `launch ...`).
  - Reload the page: same layout, focus on the same app as before.
  - Wait 1 minute without keys: ambient screen appears. Open settings and wait 1 minute: ambient does not appear.
  - Settings → Reset → OK, OK: back to the default 7 tiles with weather.
  Expected: all of the above, no console errors.

- [ ] **Step 10: Commit**

```bash
git add launcher/js/main.js
git commit -m "feat(launcher): gear opens settings; tiles, ambient delay and weather follow settings"
```

---

### Task 4: Deploy, TV check, docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Deploy**

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`
Expected: ends with "successfully launched". If install fails on the new privilege, report the exact output to the user rather than removing the privilege.

- [ ] **Step 2: TV check** (remote via `remote.py`, look via `cam.py`):
  - Gear visible left of the clock; Up, Up reaches it; OK opens Settings.
  - Add app lists real installed apps; add one, check whether its icon shows or the letter fallback appears (report which), and that the new tile launches the app.
  - Hide/reorder a tile; home row and number keys follow.
  - Ambient delay and weather toggle work; Reset restores defaults.
  - Leave the TV on the default layout afterwards (Reset) unless the user wants to keep changes.

- [ ] **Step 3: README** — in `README.md`, replace the "Using it" and "Customising" sections with:

```markdown
## Using it

Left/Right pick a tile, OK opens it, or press 1-9 to open a visible tile directly. Focus starts on the last tile opened.
Up focuses the weather card; OK there shows the 7-day forecast, Back closes it. Up again focuses the gear next to
the clock; OK opens Settings. After the ambient delay (3 idle minutes by default) only the photo, a big clock and the
temperature stay up; any key brings the rest back.

## Settings

- **Tiles**: OK shows/hides a tile. Right then OK picks it up, Up/Down move it, OK drops it. Apps you added have a
  remove button after the move handle.
- **Add app**: lists apps installed on the TV that don't have a tile yet; OK adds one at the end.
- **Display**: ambient delay (Off, 1, 3, 5, 10 min) and the weather card on/off.
- **Reset**: OK twice restores the default tiles and display options.

Settings are stored on the TV (`localStorage`, key `settings-v1`).

## Customising

- Built-in tiles and app ids: `launcher/js/tiles.js` (tile `id`s are stored in settings; don't rename them)
- Background photos: `launcher/bg/` by day, `launcher/bg/night/` between sunset and sunrise (fetched by `scripts/fetch-backgrounds.py`)
```

- [ ] **Step 4: Run all tests**

Run: `node --test tests/*.test.js` and `python -m unittest discover -s tests -p "test_*.py"`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: settings menu usage"
```
