# TV Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fast, photo-backed start screen for the Samsung TV (clock, greeting, Šiauliai weather, six tiles) that opens automatically on power-on.

**Architecture:** A plain Tizen web app in `launcher/`. Pure, testable logic lives in `launcher/js/logic.js` (UMD: global `Logic` on the TV, `module.exports` in Node). Thin modules wrap the platform (`tv.js`), network (`weather.js`), static data (`tiles.js`, `icons.js`), and `main.js` wires DOM + keys. A PowerShell script packages/signs/installs; the existing `watcher.py` relaunches the app on power-on.

**Tech Stack:** HTML/CSS/ES5-style JS (Tizen 2023 web engine), Node 24 `node:test` for unit tests, Tizen Studio CLI (`C:\tizen-studio`), signing profile `TV`, Python 3.11 watcher.

**Spec:** `docs/superpowers/specs/2026-10-29-tv-launcher-design.md`

## Global Constraints

- Layout is fixed 1920×1080; no responsive breakpoints.
- No frameworks, no build step, no external runtime resources except the Open-Meteo API.
- Tile order exactly: HDMI 1 · PC · Netflix · Stremio · Twitch · YouTube.
- App IDs: Netflix `org.tizen.netflix-app`, Stremio `IkWsFHtOY9.Stremio`, Twitch `Jz7aUrV2Q4.Twitch`, YouTube `9Ur5IzDKqV.TizenYouTube`.
- Launcher app ID `TomLaunch1.Launcher` (package `TomLaunch1`).
- Weather: Open-Meteo, latitude 55.93, longitude 23.31, timezone `Europe/Vilnius`, refresh every 30 min, cache in `localStorage`.
- Greeting bands: 05–12 morning, 12–18 afternoon, 18–23 evening, else night. Clock 24h `HH:MM`.
- Back key (Tizen keyCode 10009; Backspace/Escape in desktop browser) never exits the launcher.
- TV: 192.168.0.147, sdb target name `UE55CU8072UXXH`.
- Commits go on branch `tv-launcher`, not `master`.

## File Structure

```
launcher/
  config.xml        Tizen manifest (app id, privileges)
  index.html        markup skeleton
  style.css         all styling
  icon.png          512×512 app icon
  bg/01.jpg..10.jpg background photos (1920×1080)
  bg/CREDITS.txt    photographer credits
  js/logic.js       pure functions (time, greeting, weather view model, focus, photo index)
  js/icons.js       inline SVG strings (weather + app logos)
  js/tiles.js       TILES array
  js/tv.js          Tizen platform wrapper (launch app, show/hide HDMI)
  js/weather.js     fetch + cache
  js/main.js        rendering, key handling, timers
tests/
  logic.test.js     node:test unit tests for logic.js
  fixtures/weather.json  trimmed Open-Meteo response
scripts/
  deploy.ps1        package, sign, install, run on TV
  install-watcher.ps1  register watcher.py at Windows logon
```

---

### Task 1: Time, greeting, focus and photo logic

**Files:**
- Create: `launcher/js/logic.js`
- Test: `tests/logic.test.js`

**Interfaces:**
- Produces (global `Logic` / `module.exports`):
  - `formatTime(date: Date): string` → `"09:05"`
  - `formatDate(date: Date): string` → `"THURSDAY, 29 OCTOBER"`
  - `greeting(hour: number): string`
  - `moveFocus(index: number, dir: -1|1, count: number): number` (clamped, no wrap)
  - `photoIndex(date: Date, count: number): number` (day-of-year mod count, 0-based)
  - `parseLocal(s: string): Date` (parses `"2026-10-29T11:00"` as local time)

- [ ] **Step 1: Create branch**

```bash
git checkout -b tv-launcher
```

- [ ] **Step 2: Write the failing tests**

`tests/logic.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const Logic = require('../launcher/js/logic.js');

test('formatTime pads to HH:MM 24h', () => {
  assert.strictEqual(Logic.formatTime(new Date(2026, 9, 29, 9, 5)), '09:05');
  assert.strictEqual(Logic.formatTime(new Date(2026, 9, 29, 21, 40)), '21:40');
});

test('formatDate is uppercase weekday, day, month', () => {
  assert.strictEqual(Logic.formatDate(new Date(2026, 9, 29)), 'THURSDAY, 29 OCTOBER');
});

test('greeting bands', () => {
  assert.strictEqual(Logic.greeting(4), 'Good night.');
  assert.strictEqual(Logic.greeting(5), 'Good morning.');
  assert.strictEqual(Logic.greeting(11), 'Good morning.');
  assert.strictEqual(Logic.greeting(12), 'Good afternoon.');
  assert.strictEqual(Logic.greeting(18), 'Good evening.');
  assert.strictEqual(Logic.greeting(23), 'Good night.');
});

test('moveFocus clamps at both ends', () => {
  assert.strictEqual(Logic.moveFocus(0, -1, 6), 0);
  assert.strictEqual(Logic.moveFocus(2, 1, 6), 3);
  assert.strictEqual(Logic.moveFocus(5, 1, 6), 5);
});

test('photoIndex is day-of-year mod count', () => {
  assert.strictEqual(Logic.photoIndex(new Date(2026, 0, 1, 12), 10), 0);
  assert.strictEqual(Logic.photoIndex(new Date(2026, 0, 11, 0, 30), 10), 0);
  assert.strictEqual(Logic.photoIndex(new Date(2026, 0, 12, 23, 59), 10), 1);
  // across the March DST change the index still advances exactly one per day
  assert.strictEqual(Logic.photoIndex(new Date(2026, 2, 30, 1), 10), (88) % 10);
});

test('parseLocal reads Open-Meteo local timestamps', () => {
  const d = Logic.parseLocal('2026-10-29T17:05');
  assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()], [2026, 9, 29, 17, 5]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../launcher/js/logic.js'`

- [ ] **Step 4: Implement**

`launcher/js/logic.js`:
```js
(function (root) {
  'use strict';

  var DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  var MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY',
    'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function formatTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function formatDate(d) { return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function greeting(h) {
    if (h >= 5 && h < 12) return 'Good morning.';
    if (h >= 12 && h < 18) return 'Good afternoon.';
    if (h >= 18 && h < 23) return 'Good evening.';
    return 'Good night.';
  }

  function moveFocus(i, dir, count) {
    var n = i + dir;
    return n < 0 ? 0 : n >= count ? count - 1 : n;
  }

  function photoIndex(d, count) {
    var day = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
    return day % count;
  }

  function parseLocal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }

  var Logic = {
    formatTime: formatTime, formatDate: formatDate, greeting: greeting,
    moveFocus: moveFocus, photoIndex: photoIndex, parseLocal: parseLocal
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add launcher/js/logic.js tests/logic.test.js
git commit -m "feat(launcher): time, greeting, focus and photo logic"
```

---

### Task 2: Weather view model

**Files:**
- Modify: `launcher/js/logic.js` (add functions + exports)
- Create: `tests/fixtures/weather.json`
- Modify: `tests/logic.test.js` (append tests)

**Interfaces:**
- Consumes: `parseLocal`, `formatTime` from Task 1.
- Produces:
  - `weatherInfo(code: number, isDay: boolean): {label, sentence, icon}` — icon ∈ `sun|moon|partly|partly-night|cloud|fog|rain|snow|thunder`
  - `sunLine(now: Date, data): {kind: 'sunrise'|'sunset', text: string}`
  - `nextHours(data, now: Date, count: number): [{time: 'HH:MM', temp: number, icon: string}]` — hours strictly after `now`
  - `weatherView(data, now: Date): {temp, label, sentence, icon, hi, lo, feels, wind, humidity, sun, hours}`
  - `data` is the raw Open-Meteo JSON (`current`, `hourly`, `daily` objects).

- [ ] **Step 1: Write the fixture**

`tests/fixtures/weather.json`:
```json
{
  "current": {"temperature_2m": 13.6, "apparent_temperature": 11.8, "relative_humidity_2m": 77,
              "wind_speed_10m": 11.4, "weather_code": 0, "is_day": 1},
  "hourly": {
    "time": ["2026-10-29T10:00","2026-10-29T11:00","2026-10-29T12:00","2026-10-29T13:00",
             "2026-10-29T14:00","2026-10-29T15:00","2026-10-29T16:00","2026-10-29T17:00"],
    "temperature_2m": [14.2, 15.1, 15.9, 16.4, 16.8, 16.6, 15.7, 13.9],
    "weather_code": [0, 0, 1, 2, 2, 3, 61, 61],
    "is_day": [1, 1, 1, 1, 1, 1, 1, 0]
  },
  "daily": {
    "temperature_2m_max": [17.2, 12.0], "temperature_2m_min": [10.6, 6.1],
    "sunrise": ["2026-10-29T08:12", "2026-10-30T08:14"],
    "sunset": ["2026-10-29T17:05", "2026-10-30T17:03"]
  }
}
```

- [ ] **Step 2: Write the failing tests** (append to `tests/logic.test.js`)

```js
const data = require('./fixtures/weather.json');

test('weatherInfo maps codes and swaps night icons', () => {
  assert.deepStrictEqual(Logic.weatherInfo(0, true),
    { label: 'Clear', sentence: 'Clear skies and sunshine.', icon: 'sun' });
  assert.strictEqual(Logic.weatherInfo(0, false).icon, 'moon');
  assert.strictEqual(Logic.weatherInfo(0, false).sentence, 'Clear skies tonight.');
  assert.strictEqual(Logic.weatherInfo(2, false).icon, 'partly-night');
  assert.strictEqual(Logic.weatherInfo(63, true).icon, 'rain');
  assert.strictEqual(Logic.weatherInfo(75, true).icon, 'snow');
  assert.strictEqual(Logic.weatherInfo(95, true).label, 'Thunderstorm');
  assert.strictEqual(Logic.weatherInfo(12345, true).label, 'Overcast'); // unknown code fallback
});

test('sunLine: before sunrise, daytime, after sunset', () => {
  assert.deepStrictEqual(Logic.sunLine(new Date(2026, 9, 29, 6, 0), data), { kind: 'sunrise', text: 'Sunrise at 08:12' });
  assert.deepStrictEqual(Logic.sunLine(new Date(2026, 9, 29, 10, 34), data), { kind: 'sunset', text: 'Sunset at 17:05' });
  assert.deepStrictEqual(Logic.sunLine(new Date(2026, 9, 29, 19, 0), data), { kind: 'sunrise', text: 'Sunrise at 08:14' });
});

test('nextHours returns hours strictly after now', () => {
  const h = Logic.nextHours(data, new Date(2026, 9, 29, 10, 34), 6);
  assert.deepStrictEqual(h.map(x => x.time), ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
  assert.deepStrictEqual(h.map(x => x.temp), [15, 16, 16, 17, 17, 16]);
  assert.deepStrictEqual(h.map(x => x.icon), ['sun', 'sun', 'partly', 'partly', 'cloud', 'rain']);
});

test('weatherView rounds and assembles everything', () => {
  const v = Logic.weatherView(data, new Date(2026, 9, 29, 10, 34));
  assert.strictEqual(v.temp, 14);
  assert.strictEqual(v.label, 'Clear');
  assert.strictEqual(v.icon, 'sun');
  assert.strictEqual(v.hi, 17);
  assert.strictEqual(v.lo, 11);
  assert.strictEqual(v.feels, 12);
  assert.strictEqual(v.wind, 11);
  assert.strictEqual(v.humidity, 77);
  assert.strictEqual(v.sun.text, 'Sunset at 17:05');
  assert.strictEqual(v.hours.length, 6);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `Logic.weatherInfo is not a function`

- [ ] **Step 4: Implement** (add to `logic.js` before the `var Logic = {` line, and extend the export object)

```js
  // [codes, label, day sentence, night sentence, icon]
  var CODES = [
    [[0], 'Clear', 'Clear skies and sunshine.', 'Clear skies tonight.', 'sun'],
    [[1], 'Mostly clear', 'Mostly clear skies.', 'Mostly clear skies tonight.', 'sun'],
    [[2], 'Partly cloudy', 'A mix of sun and cloud.', 'A few clouds tonight.', 'partly'],
    [[3], 'Overcast', 'Grey and overcast.', 'Grey and overcast.', 'cloud'],
    [[45, 48], 'Fog', 'Foggy out there.', 'Foggy out there.', 'fog'],
    [[51, 53, 55, 56, 57], 'Drizzle', 'Light drizzle about.', 'Light drizzle about.', 'rain'],
    [[61, 63, 65, 66, 67], 'Rain', 'Rainy day, grab an umbrella.', 'A rainy night.', 'rain'],
    [[71, 73, 75, 77, 85, 86], 'Snow', 'Snow is falling.', 'Snow is falling.', 'snow'],
    [[80, 81, 82], 'Showers', 'Passing showers.', 'Passing showers.', 'rain'],
    [[95, 96, 99], 'Thunderstorm', 'Thunderstorms around.', 'Thunderstorms around.', 'thunder']
  ];

  function weatherInfo(code, isDay) {
    var row = CODES[3];
    for (var i = 0; i < CODES.length; i++) {
      if (CODES[i][0].indexOf(code) !== -1) { row = CODES[i]; break; }
    }
    var icon = row[4];
    if (!isDay && icon === 'sun') icon = 'moon';
    if (!isDay && icon === 'partly') icon = 'partly-night';
    return { label: row[1], sentence: isDay ? row[2] : row[3], icon: icon };
  }

  function sunLine(now, data) {
    var sunrise = parseLocal(data.daily.sunrise[0]);
    var sunset = parseLocal(data.daily.sunset[0]);
    if (now < sunrise) return { kind: 'sunrise', text: 'Sunrise at ' + formatTime(sunrise) };
    if (now < sunset) return { kind: 'sunset', text: 'Sunset at ' + formatTime(sunset) };
    return { kind: 'sunrise', text: 'Sunrise at ' + formatTime(parseLocal(data.daily.sunrise[1])) };
  }

  function nextHours(data, now, count) {
    var h = data.hourly, out = [];
    for (var i = 0; i < h.time.length && out.length < count; i++) {
      var t = parseLocal(h.time[i]);
      if (t > now) {
        out.push({
          time: formatTime(t),
          temp: Math.round(h.temperature_2m[i]),
          icon: weatherInfo(h.weather_code[i], h.is_day[i] === 1).icon
        });
      }
    }
    return out;
  }

  function weatherView(data, now) {
    var c = data.current;
    var info = weatherInfo(c.weather_code, c.is_day === 1);
    return {
      temp: Math.round(c.temperature_2m),
      label: info.label,
      sentence: info.sentence,
      icon: info.icon,
      hi: Math.round(data.daily.temperature_2m_max[0]),
      lo: Math.round(data.daily.temperature_2m_min[0]),
      feels: Math.round(c.apparent_temperature),
      wind: Math.round(c.wind_speed_10m),
      humidity: Math.round(c.relative_humidity_2m),
      sun: sunLine(now, data),
      hours: nextHours(data, now, 6)
    };
  }
```

Export object becomes:
```js
  var Logic = {
    formatTime: formatTime, formatDate: formatDate, greeting: greeting,
    moveFocus: moveFocus, photoIndex: photoIndex, parseLocal: parseLocal,
    weatherInfo: weatherInfo, sunLine: sunLine, nextHours: nextHours, weatherView: weatherView
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/`
Expected: 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add launcher/js/logic.js tests/
git commit -m "feat(launcher): weather view model"
```

---

### Task 3: Screen — markup, styling, icons, tiles, wiring

**Files:**
- Create: `launcher/index.html`, `launcher/style.css`, `launcher/js/icons.js`, `launcher/js/tiles.js`, `launcher/js/tv.js`, `launcher/js/weather.js`, `launcher/js/main.js`

**Interfaces:**
- Consumes: `Logic.*` from Tasks 1–2.
- Produces:
  - `Icons.weather[name]: string` (SVG) for every icon name `weatherInfo` returns; `Icons.sun: string`; `Icons.app[logo]: string` for `hdmi|netflix|stremio|twitch|youtube`.
  - `TILES: [{label, logo, appId?, input?, bg?, light?, glass?}]`
  - `TV.launchApp(appId, onError)`, `TV.showInput(n, onShown, onError)`, `TV.hideInput()`
  - `Weather.cached(): data|null`, `Weather.refresh(onData)`
  - Background files expected at `bg/01.jpg`…`bg/10.jpg` (Task 4).

- [ ] **Step 1: `launcher/js/icons.js`**

```js
var Icons = (function () {
  'use strict';
  var Y = '#FFC83D', W = '#EEF2F7', B = '#7CC4FF';
  function svg(body) { return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>'; }
  var sunBody = '<circle cx="32" cy="32" r="11" fill="' + Y + '"/><g stroke="' + Y + '" stroke-width="4" stroke-linecap="round">' +
    '<path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g>';
  var cloudBody = '<path d="M19 50h28a11 11 0 0 0 0-22 15 15 0 0 0-29-3A12.5 12.5 0 0 0 19 50z" fill="' + W + '"/>';
  var smallCloud = '<path d="M24 54h24a9 9 0 0 0 0-18 12 12 0 0 0-23-2A10 10 0 0 0 24 54z" fill="' + W + '"/>';
  var moonBody = '<path d="M38 8a24 24 0 1 0 18 38A20 20 0 0 1 38 8z" fill="#E6E3F2"/>';
  var raisedCloud = '<g transform="translate(0 -8)">' + cloudBody + '</g>';

  var weather = {
    sun: svg(sunBody),
    moon: svg(moonBody),
    cloud: svg(cloudBody),
    partly: svg('<g transform="translate(-8 -8) scale(.8)">' + sunBody + '</g>' + smallCloud),
    'partly-night': svg('<g transform="translate(-6 -8) scale(.75)">' + moonBody + '</g>' + smallCloud),
    fog: svg('<g stroke="' + W + '" stroke-width="5" stroke-linecap="round"><path d="M10 22h44M6 34h52M12 46h40"/></g>'),
    rain: svg(raisedCloud + '<g stroke="' + B + '" stroke-width="4" stroke-linecap="round"><path d="M22 50l-3 8M33 50l-3 8M44 50l-3 8"/></g>'),
    snow: svg(raisedCloud + '<g fill="' + W + '"><circle cx="21" cy="54" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="43" cy="54" r="3"/></g>'),
    thunder: svg(raisedCloud + '<path d="M34 44l-8 12h7l-3 8 10-13h-7l4-7z" fill="' + Y + '"/>')
  };

  var sunsetIcon = svg('<path d="M14 44a18 18 0 0 1 36 0z" fill="' + Y + '"/><path d="M6 50h52" stroke="' + Y +
    '" stroke-width="4" stroke-linecap="round"/><path d="M32 8v14M25 15l7-7 7 7" stroke="' + Y +
    '" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');

  var app = {
    hdmi: '<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg"><path d="M6 8h68v18l-9 13H15L6 26z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><rect x="19" y="18" width="42" height="8" rx="2" fill="#fff"/></svg>',
    netflix: '<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h11l18 44V0h11v64H29L11 20v44H0z" fill="#E50914"/></svg>',
    stremio: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="14" width="36" height="36" rx="7" transform="rotate(45 32 32)" fill="#8A5AFF"/><path d="M27 22l15 10-15 10z" fill="#fff"/></svg>',
    twitch: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M14 4L8 14v40h14v8h8l8-8h10l12-12V4z" fill="#fff"/><path d="M18 9h37v29l-8 8H35l-8 8v-8h-9z" fill="#9146FF"/><path d="M28 18h5v14h-5zM41 18h5v14h-5z" fill="#fff"/></svg>',
    youtube: '<svg viewBox="0 0 90 64" xmlns="http://www.w3.org/2000/svg"><rect y="4" width="90" height="56" rx="16" fill="#FF0000"/><path d="M36 20l23 12-23 12z" fill="#fff"/></svg>'
  };

  return { weather: weather, sun: sunsetIcon, app: app };
})();
```

- [ ] **Step 2: `launcher/js/tiles.js`**

```js
var TILES = [
  { label: 'HDMI 1', logo: 'hdmi', input: 1, glass: true },
  { label: 'PC', logo: 'hdmi', input: 2, glass: true },
  { label: 'Netflix', logo: 'netflix', appId: 'org.tizen.netflix-app', bg: '#000000' },
  { label: 'Stremio', logo: 'stremio', appId: 'IkWsFHtOY9.Stremio', bg: '#1E1640' },
  { label: 'Twitch', logo: 'twitch', appId: 'Jz7aUrV2Q4.Twitch', bg: '#9146FF' },
  { label: 'YouTube', logo: 'youtube', appId: '9Ur5IzDKqV.TizenYouTube', bg: '#FFFFFF', light: true }
];
```

- [ ] **Step 3: `launcher/js/tv.js`**

```js
var TV = (function () {
  'use strict';
  var hasTizen = typeof tizen !== 'undefined';

  function launchApp(appId, onError) {
    if (!hasTizen) { console.log('launch', appId); return; }
    tizen.application.launch(appId, null, function (e) { onError(e.message); });
  }

  function showInput(n, onShown, onError) {
    if (!hasTizen) { console.log('input', n); onShown(); return; }
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (s) {
      var all = s.connected.concat(s.disconnected || []);
      var src = all.filter(function (x) { return x.type === 'HDMI' && x.number === n; })[0];
      if (!src) { onError('HDMI ' + n + ' not found'); return; }
      tizen.tvwindow.setSource(src, function () {
        tizen.tvwindow.show(onShown, function (e) { onError(e.message); },
          ['0px', '0px', '1920px', '1080px'], 'MAIN');
      }, function (e) { onError(e.message); }, 'MAIN');
    }, function (e) { onError(e.message); });
  }

  function hideInput() {
    if (!hasTizen) return;
    try { tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) { /* not shown */ }
  }

  return { launchApp: launchApp, showInput: showInput, hideInput: hideInput };
})();
```

- [ ] **Step 4: `launcher/js/weather.js`**

```js
var Weather = (function () {
  'use strict';
  var URL = 'https://api.open-meteo.com/v1/forecast?latitude=55.93&longitude=23.31' +
    '&timezone=Europe%2FVilnius&forecast_days=2&wind_speed_unit=kmh' +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
    '&hourly=temperature_2m,weather_code,is_day' +
    '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset';
  var KEY = 'weather';
  var MAX_AGE = 12 * 3600 * 1000;

  function cached() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && Date.now() - c.at < MAX_AGE) return c.data;
    } catch (e) { /* no or bad cache */ }
    return null;
  }

  function refresh(onData) {
    fetch(URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { /* full */ }
      onData(data);
    }).catch(function () { /* keep showing cache, or nothing */ });
  }

  return { cached: cached, refresh: refresh };
})();
```

- [ ] **Step 5: `launcher/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Home</title>
  <link rel="stylesheet" href="style.css">
</head>
<body class="no-weather">
  <div id="ui">
    <div class="shade"></div>
    <header><div class="brand">&#10035; Home</div><div id="clock"></div></header>
    <section class="hero">
      <div id="date"></div>
      <h1 id="greeting"></h1>
      <p id="sentence" class="wx"></p>
      <p id="sun" class="wx"></p>
    </section>
    <section id="weather" class="card wx">
      <div class="now">
        <span id="w-icon"></span><span id="w-temp"></span>
        <div class="cond"><div id="w-label"></div><div id="w-hilo"></div></div>
      </div>
      <div id="w-details"></div>
      <div id="w-hours"></div>
    </section>
    <section id="tiles"></section>
    <div id="toast"></div>
  </div>
  <script src="js/logic.js"></script>
  <script src="js/icons.js"></script>
  <script src="js/tiles.js"></script>
  <script src="js/tv.js"></script>
  <script src="js/weather.js"></script>
  <script src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: `launcher/style.css`**

```css
html, body {
  margin: 0; width: 1920px; height: 1080px; overflow: hidden;
  background: #0b0f14 center / cover no-repeat;
  color: #fff; font-family: 'SamsungOne', 'Segoe UI', Roboto, sans-serif;
}
#ui { position: absolute; inset: 0; }
.shade {
  position: absolute; inset: 0;
  background:
    linear-gradient(to top, rgba(0,0,0,.65) 0%, rgba(0,0,0,.25) 45%, rgba(0,0,0,0) 70%),
    linear-gradient(to right, rgba(0,0,0,.35), rgba(0,0,0,0) 60%);
}
header {
  position: absolute; top: 52px; left: 120px; right: 120px;
  display: flex; justify-content: space-between; align-items: center; font-size: 34px;
}
#clock { font-size: 42px; font-weight: 300; }
.hero { position: absolute; left: 120px; top: 500px; }
#date { font-size: 24px; letter-spacing: 6px; opacity: .85; }
#greeting { font-size: 112px; font-weight: 500; letter-spacing: -2px; margin: 18px 0 8px; }
#sentence { font-size: 32px; margin: 0 0 28px; }
#sun { display: flex; align-items: center; gap: 12px; font-size: 26px; margin: 0; opacity: .9; }
#sun svg { width: 30px; height: 30px; }
.card {
  position: absolute; right: 120px; top: 478px; width: 600px; padding: 28px 32px; border-radius: 20px;
  background: rgba(20,28,36,.35); backdrop-filter: blur(18px); border: 1px solid rgba(255,255,255,.15);
}
.now { display: flex; align-items: center; gap: 22px; }
#w-icon svg { width: 84px; height: 84px; display: block; }
#w-temp { font-size: 96px; font-weight: 300; line-height: 1; }
.cond { margin-left: auto; text-align: right; font-size: 30px; }
#w-hilo { font-size: 24px; opacity: .85; margin-top: 8px; }
#w-details { font-size: 22px; opacity: .8; margin: 16px 0 18px; }
#w-hours { display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,.15); padding-top: 16px; }
.hour { text-align: center; font-size: 22px; }
.hour .t { opacity: .75; }
.hour svg { width: 40px; height: 40px; display: block; margin: 8px auto; }
#tiles { position: absolute; left: 120px; right: 120px; bottom: 70px; height: 196px; display: flex; gap: 24px; }
.tile {
  flex: 1; position: relative; border-radius: 14px;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease-out, box-shadow .15s ease-out;
}
.tile.glass { background: rgba(30,36,44,.45); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.12); }
.tile .logo svg { height: 76px; width: auto; display: block; margin-top: -20px; }
.tile .label { position: absolute; left: 20px; bottom: 16px; font-size: 22px; }
.tile.light .label { color: #111; }
.tile.focused { transform: scale(1.06); box-shadow: 0 0 0 4px #fff, 0 12px 40px rgba(0,0,0,.5); z-index: 1; }
#toast {
  position: absolute; left: 50%; top: 60px; transform: translateX(-50%); padding: 16px 28px;
  background: rgba(0,0,0,.8); border-radius: 12px; font-size: 24px; opacity: 0; transition: opacity .2s;
}
#toast.show { opacity: 1; }
body.no-weather .wx { display: none; }
body.input-mode { background: transparent !important; }
body.input-mode #ui { display: none; }
```

- [ ] **Step 7: `launcher/js/main.js`**

```js
(function () {
  'use strict';
  var BG_COUNT = 10;
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var focus = 0;
  var inputMode = false;
  var weatherData = null;

  function $(id) { return document.getElementById(id); }

  function loadFocus() {
    try {
      var v = parseInt(localStorage.getItem('focus'), 10);
      if (v >= 0 && v < TILES.length) return v;
    } catch (e) { /* storage unavailable */ }
    return 0;
  }

  function saveFocus() {
    try { localStorage.setItem('focus', String(focus)); } catch (e) { /* storage unavailable */ }
  }

  function renderTiles() {
    var row = $('tiles');
    row.innerHTML = '';
    TILES.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tile' + (t.glass ? ' glass' : '') + (t.light ? ' light' : '');
      if (t.bg) el.style.background = t.bg;
      el.innerHTML = '<div class="logo">' + Icons.app[t.logo] + '</div><div class="label">' + t.label + '</div>';
      row.appendChild(el);
    });
    updateFocus();
  }

  function updateFocus() {
    var els = $('tiles').children;
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === focus);
  }

  function tick() {
    var now = new Date();
    $('clock').textContent = Logic.formatTime(now);
    $('date').textContent = Logic.formatDate(now);
    $('greeting').textContent = Logic.greeting(now.getHours());
  }

  function renderWeather(data) {
    if (data) weatherData = data;
    document.body.classList.toggle('no-weather', !weatherData);
    if (!weatherData) return;
    var v = Logic.weatherView(weatherData, new Date());
    $('w-icon').innerHTML = Icons.weather[v.icon];
    $('w-temp').textContent = v.temp + '\u00B0';
    $('w-label').textContent = v.label;
    $('w-hilo').textContent = 'H ' + v.hi + '\u00B0  L ' + v.lo + '\u00B0';
    $('w-details').textContent = 'Feels ' + v.feels + '\u00B0 \u00B7 Wind ' + v.wind + ' km/h \u00B7 Humidity ' + v.humidity + '%';
    $('w-hours').innerHTML = v.hours.map(function (h) {
      return '<div class="hour"><div class="t">' + h.time + '</div>' + Icons.weather[h.icon] + '<div>' + h.temp + '\u00B0</div></div>';
    }).join('');
    $('sentence').textContent = v.sentence;
    $('sun').innerHTML = Icons.sun + '<span>' + v.sun.text + '</span>';
  }

  function setBackground() {
    var n = Logic.photoIndex(new Date(), BG_COUNT) + 1;
    document.body.style.backgroundImage = 'url(bg/' + (n < 10 ? '0' : '') + n + '.jpg)';
  }

  function showError(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showError.timer);
    showError.timer = setTimeout(function () { el.classList.remove('show'); }, 4000);
  }

  function enterInput() { inputMode = true; document.body.classList.add('input-mode'); }

  function exitInput() {
    TV.hideInput();
    inputMode = false;
    document.body.classList.remove('input-mode');
  }

  function activate() {
    var t = TILES[focus];
    saveFocus();
    if (t.appId) TV.launchApp(t.appId, showError);
    else TV.showInput(t.input, enterInput, showError);
  }

  function refreshScreen() { tick(); setBackground(); renderWeather(); }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var isBack = BACK.indexOf(k) !== -1;
    if (isBack) e.preventDefault();
    if (inputMode) { if (isBack) exitInput(); return; }
    if (k === 37) { focus = Logic.moveFocus(focus, -1, TILES.length); updateFocus(); }
    else if (k === 39) { focus = Logic.moveFocus(focus, 1, TILES.length); updateFocus(); }
    else if (k === 13) activate();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (inputMode) exitInput(); }
    else refreshScreen();
  });

  focus = loadFocus();
  renderTiles();
  refreshScreen();
  renderWeather(Weather.cached());
  Weather.refresh(renderWeather);
  setInterval(tick, 10000);
  setInterval(function () { renderWeather(); }, 10 * 60 * 1000);
  setInterval(function () { Weather.refresh(renderWeather); }, 30 * 60 * 1000);
})();
```

- [ ] **Step 8: Preview in a browser and check layout**

Run (renders a 1920×1080 screenshot with headless Edge; backgrounds may be missing until Task 4):
```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --window-size=1920,1080 --virtual-time-budget=8000 --screenshot="$PWD\build-preview.png" "file:///$((Resolve-Path launcher\index.html) -replace '\\','/')"
```
Expected: open `build-preview.png` — clock top-right, greeting and date bottom-left, weather card with 6 hourly columns on the right, six tiles in the spec order with the first tile outlined. No overlap between weather card and tiles.
Also open `launcher/index.html` in Edge manually: Left/Right moves the outline and stops at the ends; Enter on a tile logs to console; Backspace does nothing.

- [ ] **Step 9: Commit**

```bash
git add launcher/
git commit -m "feat(launcher): screen layout, tiles, weather card and key handling"
```

---

### Task 4: Background photos and app icon

**Files:**
- Create: `launcher/bg/01.jpg` … `launcher/bg/10.jpg`, `launcher/bg/CREDITS.txt`, `launcher/icon.png`
- Create: `scripts/fetch-backgrounds.py`

**Interfaces:**
- Produces: exactly 10 files `bg/01.jpg`…`bg/10.jpg`, 1920×1080 JPEG, ≤ 600 KB each (consumed by `setBackground` in Task 3, which assumes `BG_COUNT = 10`).

- [ ] **Step 1: Write the fetch script**

`scripts/fetch-backgrounds.py` (Lorem Picsum serves Unsplash-licensed photos by id):
```python
"""Download landscape candidates from Lorem Picsum (Unsplash licence) at 1920x1080.
Usage: python scripts/fetch-backgrounds.py OUT_DIR ID [ID ...]"""
import json
import sys
import urllib.request
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
credits = []
for pid in sys.argv[2:]:
    with urllib.request.urlopen(f"https://picsum.photos/id/{pid}/info", timeout=20) as r:
        info = json.load(r)
    urllib.request.urlretrieve(f"https://picsum.photos/id/{pid}/1920/1080.jpg", out / f"{pid}.jpg")
    credits.append(f"{pid}: {info['author']} - {info['url']}")
    print(pid, info["author"])
(out / "credits-candidates.txt").write_text("\n".join(credits) + "\n", encoding="utf-8")
```

- [ ] **Step 2: Download candidates into the scratchpad**

Run:
```bash
python scripts/fetch-backgrounds.py "$SCRATCH/bg-candidates" 10 15 16 17 28 29 1015 1016 1018 1036 1039 1043 1044 1050 1056 1067
```
(`$SCRATCH` = the session scratchpad directory.)
Expected: 16 JPEGs and `credits-candidates.txt`.

- [ ] **Step 3: Pick 10**

View each candidate. Keep 10 that are landscapes with open sky or calm top area and darker lower third (text legibility). Copy them as `launcher/bg/01.jpg`…`10.jpg` and write the matching lines of `credits-candidates.txt` into `launcher/bg/CREDITS.txt` in the same order.
Check: `Get-ChildItem launcher\bg\*.jpg | Measure-Object Length -Maximum` — max ≤ 600 KB. If any is larger, re-encode it:
```bash
python -c "import cv2,sys; i=cv2.imread(sys.argv[1]); cv2.imwrite(sys.argv[1], i, [cv2.IMWRITE_JPEG_QUALITY, 82])" launcher/bg/NN.jpg
```

- [ ] **Step 4: App icon**

Create `launcher/icon.png` 512×512: dark rounded square with the ✳ glyph, via:
```bash
python -c "
import cv2, numpy as np
img = np.zeros((512,512,3), np.uint8); img[:] = (40,30,20)
c=(256,256)
for a in range(0,180,30):
    t=np.deg2rad(a); d=np.array([np.cos(t),np.sin(t)])*150
    cv2.line(img,(int(c[0]-d[0]),int(c[1]-d[1])),(int(c[0]+d[0]),int(c[1]+d[1])),(255,255,255),28,cv2.LINE_AA)
cv2.imwrite('launcher/icon.png', img)"
```

- [ ] **Step 5: Re-run the preview from Task 3 Step 8**

Expected: photo background visible, text legible over it.

- [ ] **Step 6: Commit**

```bash
git add launcher/bg launcher/icon.png scripts/fetch-backgrounds.py
git commit -m "feat(launcher): bundled background photos and app icon"
```

---

### Task 5: Package, install, verify on the TV

**Files:**
- Create: `launcher/config.xml`, `scripts/deploy.ps1`
- Modify: `.gitignore` (add `build/`, `build-preview.png`)

**Interfaces:**
- Consumes: everything in `launcher/`; signing profile `TV` in `C:\tizen-studio-data\profile\profiles.xml` (already set up).
- Produces: app `TomLaunch1.Launcher` installed on the TV; `scripts/deploy.ps1` re-deploys in one command.

- [ ] **Step 1: `launcher/config.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://tomaspc.local/launcher" version="1.0.0" viewmodes="maximized">
    <tizen:application id="TomLaunch1.Launcher" package="TomLaunch1" required_version="2.3"/>
    <content src="index.html"/>
    <icon src="icon.png"/>
    <name>Home</name>
    <feature name="http://tizen.org/feature/screen.size.all"/>
    <tizen:privilege name="http://tizen.org/privilege/application.launch"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.window"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:profile name="tv-samsung"/>
    <access origin="*" subdomains="true"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable"
                   encryption="disable" install-location="auto" hwkey-event="enable"/>
</widget>
```

- [ ] **Step 2: `scripts/deploy.ps1`**

```powershell
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
```

- [ ] **Step 3: Ignore build output**

Append to `.gitignore`:
```
build/
build-preview.png
```

- [ ] **Step 4: Deploy**

Run: `powershell -File scripts/deploy.ps1`
Expected: `Tizen application is successfully installed.` and `... successfully launched.`

- [ ] **Step 5: Verify on the TV via camera** (`python cam.py snap.jpg`, view it; drive with `python remote.py ...`)

Check each, fixing and re-deploying on failure:
1. Launcher visible: photo, greeting, clock, weather card populated (TV has internet), six tiles.
2. `python remote.py KEY_RIGHT*5` → outline moves to YouTube and stops; `KEY_LEFT*5` back to HDMI 1.
3. For each app tile (Netflix, Stremio, Twitch, YouTube): focus it, `KEY_ENTER`, snapshot shows the app; then `KEY_RETURN` (or `KEY_HOME` + relaunch with `tizen run`) returns to the launcher with the same tile focused.
4. PC tile: `KEY_ENTER` → PC desktop full screen; `KEY_RETURN` → launcher returns. Note any visible input lag and whether PC audio plays (ask the user to confirm audio).
5. HDMI 1 tile: `KEY_ENTER` → black (nothing connected) with no crash; `KEY_RETURN` returns.
6. `KEY_RETURN` on the launcher itself → launcher stays.

- [ ] **Step 6: Commit**

```bash
git add launcher/config.xml scripts/deploy.ps1 .gitignore
git commit -m "feat(launcher): Tizen manifest and deploy script"
```

---

### Task 6: Auto-launch on power-on

**Files:**
- Create: `scripts/install-watcher.ps1`
- Modify: `watcher.py` only if Step 2 shows the launch message needs a different `action_type`.

**Interfaces:**
- Consumes: `watcher.launch(app_id)` and `watcher.power_state()` (existing), app ID `TomLaunch1.Launcher`.
- Produces: Startup-folder shortcut `TV Launcher Watcher.lnk` running `pythonw.exe watcher.py TomLaunch1.Launcher`.

- [ ] **Step 1: Verify the launch call works for this app**

With the TV on and showing Samsung's home (`python remote.py KEY_HOME`):
```bash
python -c "import watcher; watcher.launch('TomLaunch1.Launcher')"
```
Then `python cam.py snap.jpg` → launcher visible.
If not visible, change `"action_type": "DEEP_LINK"` to `"NATIVE_LAUNCH"` in `watcher.py` and retry. If neither works, stop and report.

- [ ] **Step 2: `scripts/install-watcher.ps1`**

```powershell
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
```

- [ ] **Step 3: Install and start**

Run: `powershell -File scripts/install-watcher.ps1`
Expected: `Installed ...TV Launcher Watcher.lnk and started watcher`; `Get-Process pythonw` shows a process.

- [ ] **Step 4: TV backup setting**

Via `remote.py` + camera: Settings → Advanced Features → Start Screen Options → **Autorun Last App** = on. Verify the toggle via camera.

- [ ] **Step 5: Power-cycle test**

`python remote.py KEY_POWER` (TV off), wait 15 s, ask the user to turn the TV on with the remote (network power-on may be disabled), then within ~10 s `python cam.py snap.jpg` → launcher visible.

- [ ] **Step 6: Commit**

```bash
git add scripts/install-watcher.ps1 watcher.py
git commit -m "feat: auto-launch launcher on TV power-on"
```
