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
  assert.strictEqual(Logic.greeting(4), 'Good evening.');
  assert.strictEqual(Logic.greeting(5), 'Good morning.');
  assert.strictEqual(Logic.greeting(11), 'Good morning.');
  assert.strictEqual(Logic.greeting(12), 'Good afternoon.');
  assert.strictEqual(Logic.greeting(18), 'Good evening.');
  assert.strictEqual(Logic.greeting(23), 'Good evening.');
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

test('timeOfDay: night outside sunrise-sunset, morning/evening the two hours after/before it', () => {
  const at = (h, m) => Logic.timeOfDay(new Date(2026, 9, 29, h, m), data); // sunrise 08:12, sunset 17:05
  assert.deepStrictEqual([at(8, 11), at(8, 12), at(10, 11), at(10, 12), at(15, 4), at(15, 5), at(17, 4), at(17, 5)],
    ['night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night']);
  // no weather, or no row for today: sunrise 06:00, sunset 18:00
  const no = (h, m, d) => Logic.timeOfDay(new Date(2026, 9, 29, h, m), d);
  assert.deepStrictEqual([no(5, 59, null), no(6, 0, null), no(8, 0, null), no(15, 59, null), no(16, 0, null), no(18, 0, null)],
    ['night', 'morning', 'day', 'day', 'evening', 'night']);
  assert.strictEqual(Logic.timeOfDay(new Date(2027, 0, 5, 7, 0), data), 'morning');
});

test('picture times: all by default, toggled per picture, forgotten on remove', () => {
  const s = Logic.normalizeSettings(null, B);
  const pics = [{ name: 'a.jpg' }, { name: 'b.jpg' }];
  assert.strictEqual(Logic.timesLabel(Logic.pictureTimes(s, 'a.jpg')), 'Any time');
  const s1 = Logic.togglePictureTime(Logic.togglePictureTime(s, 'a.jpg', 'night'), 'a.jpg', 'day');
  assert.deepStrictEqual(Logic.pictureTimes(s1, 'a.jpg'), ['morning', 'evening']);
  assert.strictEqual(Logic.timesLabel(Logic.pictureTimes(s1, 'a.jpg')), 'Morning · Evening');
  assert.deepStrictEqual(Logic.picturesFor(pics, s1, 'night').map(p => p.name), ['b.jpg']);
  assert.deepStrictEqual(Logic.picturesFor(pics, s1, 'evening').map(p => p.name), ['a.jpg', 'b.jpg']);
  // switching every time back on drops the entry; switching all off is allowed
  const back = Logic.togglePictureTime(Logic.togglePictureTime(s1, 'a.jpg', 'night'), 'a.jpg', 'day');
  assert.deepStrictEqual(back.pictureTimes, {});
  let none = s;
  for (const t of Logic.TIMES) none = Logic.togglePictureTime(none, 'b.jpg', t);
  assert.strictEqual(Logic.timesLabel(Logic.pictureTimes(none, 'b.jpg')), 'Never shown');
  assert.deepStrictEqual(Logic.forgetPicture(none, 'b.jpg').pictureTimes, {});
  assert.deepStrictEqual(s.pictureTimes, {}); // input untouched
  // saved values are cleaned up
  assert.deepStrictEqual(Logic.normalizeSettings({ pictureTimes: { 'a.jpg': ['night', 'x', 'morning'], 'b.jpg': 'day' } }, B).pictureTimes,
    { 'a.jpg': ['morning', 'night'] });
  assert.deepStrictEqual(Logic.normalizeSettings({ pictureTimes: [] }, B).pictureTimes, {});
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

test('nextHours swaps to night icons when is_day is 0', () => {
  const night = {
    hourly: {
      time: ['2026-10-29T20:00', '2026-10-29T21:00'],
      temperature_2m: [9.4, 8.6],
      weather_code: [0, 2],
      is_day: [0, 0]
    }
  };
  const h = Logic.nextHours(night, new Date(2026, 9, 29, 19, 30), 2);
  assert.deepStrictEqual(h.map(x => x.time), ['20:00', '21:00']);
  assert.deepStrictEqual(h.map(x => x.icon), ['moon', 'partly-night']);
});

test('weatherView at night shows moon icon and tonight sentence', () => {
  const nightData = JSON.parse(JSON.stringify(data));
  nightData.current.is_day = 0;
  nightData.current.weather_code = 0;
  const v = Logic.weatherView(nightData, new Date(2026, 9, 29, 22, 0));
  assert.strictEqual(v.icon, 'moon');
  assert.strictEqual(v.label, 'Clear');
  assert.strictEqual(v.sentence, 'Clear skies tonight.');
  assert.strictEqual(v.sun.kind, 'sunrise');
  assert.strictEqual(v.sun.text, 'Sunrise at 08:14');
});

test('weatherView day sentence and hours match nextHours', () => {
  const now = new Date(2026, 9, 29, 10, 34);
  const v = Logic.weatherView(data, now);
  assert.strictEqual(v.sentence, 'Clear skies and sunshine.');
  assert.deepStrictEqual(v.hours, Logic.nextHours(data, now, 6));
});

test('weatherView uses the daily row matching today, not index 0', () => {
  const v = Logic.weatherView(data, new Date(2026, 9, 30, 9, 0)); // fetched yesterday
  assert.strictEqual(v.hi, 12);
  assert.strictEqual(v.lo, 6);
  assert.strictEqual(v.sun.text, 'Sunset at 17:03');
  assert.strictEqual(Logic.sunLine(new Date(2026, 9, 30, 6, 0), data).text, 'Sunrise at 08:14');
});

test('weatherView returns null when today has no daily row', () => {
  assert.strictEqual(Logic.weatherView(data, new Date(2026, 9, 31, 9, 0)), null);
  assert.strictEqual(Logic.weatherView(data, new Date(2026, 9, 28, 9, 0)), null);
});

test('weekView lists days from today with rounded temps, rain and wind', () => {
  const w = Logic.weekView(data, new Date(2026, 9, 29, 10, 34));
  assert.deepStrictEqual(w, [
    { day: 'Today', date: '29 Oct', icon: 'partly', label: 'Partly cloudy', hi: 17, lo: 11, rain: 10, mm: 0, wind: 15 },
    { day: 'Fri', date: '30 Oct', icon: 'rain', label: 'Rain', hi: 12, lo: 6, rain: 85, mm: 4.3, wind: 22 }
  ]);
});

test('weekView skips past days and is null without a row for today', () => {
  const w = Logic.weekView(data, new Date(2026, 9, 30, 9, 0));
  assert.deepStrictEqual(w.map(d => d.day), ['Today']);
  assert.strictEqual(w[0].date, '30 Oct');
  assert.strictEqual(Logic.weekView(data, new Date(2026, 9, 31, 9, 0)), null);
});

test('weekView tolerates missing rain and wind', () => {
  const d = JSON.parse(JSON.stringify(data));
  delete d.daily.precipitation_probability_max;
  delete d.daily.precipitation_sum;
  delete d.daily.wind_speed_10m_max;
  const day = Logic.weekView(d, new Date(2026, 9, 29, 10, 0))[0];
  assert.deepStrictEqual([day.rain, day.mm, day.wind], [null, null, null]);
});

test('weekChart puts days at column centres on one shared temperature scale', () => {
  const pts = Logic.weekChart([{ hi: 10, lo: 4 }, { hi: 7, lo: 0 }], 200, 120, 10);
  assert.deepStrictEqual(pts, [{ x: 50, hi: 10, lo: 70 }, { x: 150, hi: 40, lo: 110 }]);
  assert.deepStrictEqual(Logic.weekChart([{ hi: 5, lo: 5 }], 100, 50, 5), [{ x: 50, hi: 5, lo: 5 }]);
});

test('numberTile maps digit keys 1-9 to tile indexes within range', () => {
  assert.strictEqual(Logic.numberTile(49, 7), 0); // '1'
  assert.strictEqual(Logic.numberTile(55, 7), 6); // '7'
  assert.strictEqual(Logic.numberTile(56, 7), -1); // '8' with only 7 tiles
  assert.strictEqual(Logic.numberTile(48, 7), -1); // '0'
  assert.strictEqual(Logic.numberTile(13, 7), -1);
});

const B = [
  { id: 'hdmi1', label: 'HDMI 1', input: 1 },
  { id: 'netflix', label: 'Netflix', appId: 'org.tizen.netflix-app' },
  { id: 'youtube', label: 'YouTube', appId: 'yt' }
];

test('normalizeSettings gives defaults for missing or corrupt input', () => {
  for (const raw of [null, 'x', 42, [], {}]) {
    assert.deepStrictEqual(Logic.normalizeSettings(raw, B),
      { order: ['hdmi1', 'netflix', 'youtube'], hidden: [], added: {}, ambientMin: 3, weather: true, background: 'photos',
        country: 'Lithuania', city: 'Šiauliai', timezone: 'auto', pictureTimes: {} });
  }
});

test('resetPart puts back only that part and isDefault checks it', () => {
  const d = Logic.normalizeSettings(null, B);
  const s = Object.assign({}, d, { order: ['youtube', 'hdmi1', 'netflix'], hidden: ['netflix'], ambientMin: 10, weather: false, city: 'Kaunas', timezone: 'Europe/Riga' });
  assert.strictEqual(Logic.isDefault(s, 'tiles', B), false);
  const tiles = Logic.resetPart(s, 'tiles', B);
  assert.deepStrictEqual([tiles.order, tiles.hidden, tiles.ambientMin, tiles.city], [d.order, [], 10, 'Kaunas']);
  assert.strictEqual(Logic.isDefault(tiles, 'tiles', B), true);
  assert.strictEqual(Logic.isDefault(tiles, 'display', B), false);
  const display = Logic.resetPart(s, 'display', B);
  assert.deepStrictEqual([display.ambientMin, display.weather, display.city], [3, true, 'Kaunas']);
  const location = Logic.resetPart(s, 'location', B);
  assert.deepStrictEqual([location.city, location.timezone, location.ambientMin], ['Šiauliai', 'auto', 10]);
  assert.deepStrictEqual(Logic.resetPart(s, 'all', B), d);
  assert.strictEqual(Logic.isDefault(d, 'all', B), true);
  assert.strictEqual(s.ambientMin, 10); // input untouched
});

test('normalizeSettings hides off-by-default built-ins only when nothing is saved', () => {
  const b = [B[0], Object.assign({ off: true }, B[1]), B[2]];
  assert.deepStrictEqual(Logic.normalizeSettings(null, b).hidden, ['netflix']);
  assert.deepStrictEqual(Logic.normalizeSettings({ hidden: [] }, b).hidden, []);
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
    ambientMin: 7, weather: 'no', background: 'gif'
  }, B);
  assert.deepStrictEqual(s.added, { 'app:foo': { label: 'Foo', appId: 'foo', icon: 'file:///foo.png' } });
  assert.deepStrictEqual(s.order, ['app:foo', 'hdmi1', 'netflix', 'youtube']);
  assert.strictEqual(s.ambientMin, 3);
  assert.strictEqual(s.weather, true);
  assert.strictEqual(s.background, 'photos');
});

test('normalizeSettings keeps valid display options and never hides every tile', () => {
  const s = Logic.normalizeSettings({ ambientMin: 0, weather: false, background: 'custom', hidden: ['hdmi1', 'netflix', 'youtube'] }, B);
  assert.strictEqual(s.ambientMin, 0);
  assert.strictEqual(s.weather, false);
  assert.strictEqual(s.background, 'custom');
  assert.deepStrictEqual(s.hidden, []);
});

test('allTiles and visibleTiles build tiles in order with hidden flags', () => {
  let s = Logic.normalizeSettings({ order: ['youtube', 'hdmi1', 'netflix'], hidden: ['hdmi1'] }, B);
  s = Logic.addApp(s, { appId: 'foo', label: 'Foo', icon: '' });
  const all = Logic.allTiles(s, B);
  assert.deepStrictEqual(all.map(t => [t.id, t.hidden]),
    [['youtube', false], ['hdmi1', true], ['netflix', false], ['app:foo', false]]);
  assert.deepStrictEqual(all[3], { id: 'app:foo', label: 'Foo', appId: 'foo', icon: '', added: true, hidden: false });
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

test('choices lists each dropdown setting in order with labels', () => {
  assert.deepStrictEqual(Logic.choices('ambientMin').map(c => c.label), ['Off', '1 min', '3 min', '5 min', '10 min']);
  assert.deepStrictEqual(Logic.choices('ambientMin').map(c => c.value), [0, 1, 3, 5, 10]);
  assert.deepStrictEqual(Logic.choices('background').map(c => c.value), ['photos', 'custom']);
});

test('stepChoice moves to the next or previous choice and wraps around', () => {
  assert.strictEqual(Logic.stepChoice('ambientMin', 3, 1), 5);
  assert.strictEqual(Logic.stepChoice('ambientMin', 3, -1), 1);
  assert.strictEqual(Logic.stepChoice('ambientMin', 10, 1), 0);
  assert.strictEqual(Logic.stepChoice('background', 'photos', -1), 'custom');
});

test('choiceIndex finds the saved value, -1 when it is not a choice', () => {
  assert.strictEqual(Logic.choiceIndex('ambientMin', 5), 3);
  assert.strictEqual(Logic.choiceIndex('background', 'custom'), 1);
  assert.strictEqual(Logic.choiceIndex('ambientMin', 7), -1);
});

test('normalizeSettings keeps a valid place and zone, else falls back', () => {
  const ok = Logic.normalizeSettings({ country: 'Japan', city: 'Osaka', timezone: 'UTC' }, B);
  assert.deepStrictEqual([ok.country, ok.city, ok.timezone], ['Japan', 'Osaka', 'UTC']);
  const wrongCity = Logic.normalizeSettings({ country: 'Japan', city: 'Vilnius' }, B);
  assert.deepStrictEqual([wrongCity.country, wrongCity.city], ['Japan', 'Tokyo']);
  const bad = Logic.normalizeSettings({ country: 'Atlantis', city: 'Osaka', timezone: 'Mars/Base' }, B);
  assert.deepStrictEqual([bad.country, bad.city, bad.timezone], ['Lithuania', 'Šiauliai', 'auto']);
});

test('city and time zone choices follow the saved country', () => {
  const s = Logic.normalizeSettings({ country: 'United States' }, B);
  assert.deepStrictEqual(Logic.choices('city', s).map(c => c.value), ['New York', 'Chicago', 'Denver', 'Los Angeles']);
  const zones = Logic.choices('timezone', s);
  assert.deepStrictEqual(zones[0], { value: 'auto', label: 'City (America/New York)' });
  assert.strictEqual(zones[1].value, 'UTC');
  assert.strictEqual(Logic.choiceIndex('timezone', 'Asia/Tokyo', s) > 0, true);
});

test('stepOption moves a new country to its first city', () => {
  const s = Logic.normalizeSettings({ country: 'Lithuania', city: 'Kaunas' }, B);
  const next = Logic.stepOption(s, 'country', 1);
  assert.deepStrictEqual([next.country, next.city], ['Latvia', 'Riga']);
  assert.strictEqual(Logic.stepOption(s, 'country', -1).country, 'Australia'); // wraps
  assert.strictEqual(Logic.stepOption(s, 'city', 1).city, 'Klaipėda');
  assert.strictEqual(s.city, 'Kaunas');
});

test('chooseOption keeps the city when the same country is picked again', () => {
  const s = Logic.normalizeSettings({ country: 'Lithuania', city: 'Kaunas' }, B);
  assert.strictEqual(Logic.chooseOption(s, 'country', 'Lithuania').city, 'Kaunas');
  assert.deepStrictEqual(['country', 'city'].map(k => Logic.chooseOption(s, 'country', 'Japan')[k]), ['Japan', 'Tokyo']);
  assert.strictEqual(Logic.chooseOption(s, 'ambientMin', 10).ambientMin, 10);
});

test("timeZone is the city's zone on auto, else the chosen one", () => {
  const s = Logic.normalizeSettings({ country: 'Japan' }, B);
  assert.strictEqual(Logic.timeZone(s), 'Asia/Tokyo');
  assert.strictEqual(Logic.timeZone(Logic.setOption(s, 'timezone', 'UTC')), 'UTC');
});

test('zonedDate gives the wall-clock time in a zone, unchanged for an unknown one', () => {
  const at = new Date(Date.UTC(2026, 9, 31, 23, 30, 15));
  const f = d => [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
  assert.deepStrictEqual(f(Logic.zonedDate(at, 'UTC')), [2026, 9, 31, 23, 30, 15]);
  assert.deepStrictEqual(f(Logic.zonedDate(at, 'Asia/Tokyo')), [2026, 10, 1, 8, 30, 15]);
  assert.deepStrictEqual(f(Logic.zonedDate(at, 'America/New_York')), [2026, 9, 31, 19, 30, 15]);
  assert.deepStrictEqual(f(Logic.zonedDate(new Date(Date.UTC(2026, 0, 1, 0, 0)), 'UTC')), [2026, 0, 1, 0, 0, 0]); // midnight is 0, not 24
  assert.strictEqual(Logic.zonedDate(at, 'Mars/Base'), at);
});

test("weatherUrl asks for the place's coordinates in the chosen zone", () => {
  const s = Logic.normalizeSettings({ country: 'United Kingdom', city: 'Edinburgh', timezone: 'Europe/Vilnius' }, B);
  const url = Logic.weatherUrl(s);
  assert.match(url, /latitude=55\.95&longitude=-3\.19&/);
  assert.match(url, /&timezone=Europe%2FVilnius&/);
  assert.match(Logic.weatherUrl(Logic.normalizeSettings(null, B)), /latitude=55\.93&longitude=23\.31&timezone=Europe%2FVilnius&/);
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

test('isUserApp accepts real apps whose icon is named after the app id', () => {
  const ok = (appId, icon) => Logic.isUserApp({ appId, label: 'x', icon });
  assert.strictEqual(ok('MCmYXNxgcu.DisneyPlus', '/opt/usr/apps/MCmYXNxgcu/shared/res/MCmYXNxgcu.DisneyPlus.png'), true);
  assert.strictEqual(ok('org.tizen.browser', '/opt/usr/apps/org.tizen.browser/shared/res/org.tizen.browser.png'), true);
  assert.strictEqual(ok('vbUQClczfR.Wuakitv', '/opt/usr/apps/vbUQClczfR/shared/res/vbUQClczfR.Wuakitv.jpg'), true);
  assert.strictEqual(ok('org.tizen.browser', 'file:///opt/usr/apps/org.tizen.browser/shared/res/org.tizen.browser.PNG'), true);
});

test('isUserApp rejects system packages and internal blocklisted apps', () => {
  const no = (appId, icon) => Logic.isUserApp({ appId, label: 'x', icon });
  assert.strictEqual(no('com.samsung.tv.SmartThingsApp', '/opt/usr/apps/com.samsung.tv.SmartThingsApp/shared/res/icon.png'), false);
  assert.strictEqual(no('org.tizen.pvrplayer', '/usr/apps/org.tizen.pvrplayer/shared/res/org.tizen.pvrplayer.png'), false);
  assert.strictEqual(no('a.b', ''), false);
  assert.strictEqual(no('a.b', '/opt/usr/apps/a.b/shared/res/other.id.png'), false);
  assert.strictEqual(no('com.samsung.tv.CSBilling', '/opt/usr/apps/com.samsung.tv.CSBilling/shared/res/com.samsung.tv.CSBilling.png'), false);
  assert.strictEqual(no('com.samsung.tv.quickpanel', '/opt/usr/apps/com.samsung.tv.quickpanel/shared/res/com.samsung.tv.quickpanel.png'), false);
});

test('normalizeSettings turns the removed Alone background into photos', () => {
  assert.strictEqual(Logic.normalizeSettings({ background: 'alone' }, B).background, 'photos');
});

test('isPicture accepts image files and skips macOS resource forks', () => {
  assert.deepStrictEqual(['a.JPG', 'b.jpeg', 'c.png', 'd.webp', 'e.bmp', 'f.gif', '._a.jpg', 'g.mp4', 'jpg', 'h.jpg.txt'].map(Logic.isPicture),
    [true, true, true, true, true, true, false, false, false, false]);
});

test('byName sorts pictures by name ignoring case', () => {
  assert.deepStrictEqual([{ name: 'b.jpg' }, { name: 'A.jpg' }, { name: 'c.jpg' }].sort(Logic.byName).map(p => p.name), ['A.jpg', 'b.jpg', 'c.jpg']);
});

test('safeName replaces characters that break a URL and keeps the rest', () => {
  assert.strictEqual(Logic.safeName('Šiauliai #1 (50%) "best".jpg'), 'Šiauliai _1 _50__ _best_.jpg');
  assert.strictEqual(Logic.safeName('a/b\\c?.png'), 'a_b_c_.png');
});
