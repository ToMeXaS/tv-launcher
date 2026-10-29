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

test('isNight uses today\'s sunrise/sunset, else 18:00-06:00', () => {
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 8, 11), data), true);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 8, 12), data), false);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 17, 4), data), false);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 17, 5), data), true);
  // no weather, or no row for today
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 17, 30), null), false);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 18, 0), null), true);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 5, 59), null), true);
  assert.strictEqual(Logic.isNight(new Date(2026, 9, 29, 6, 0), null), false);
  assert.strictEqual(Logic.isNight(new Date(2027, 0, 5, 20, 0), data), true);
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

test('weekView lists days from today with rounded temps and rain chance', () => {
  const w = Logic.weekView(data, new Date(2026, 9, 29, 10, 34));
  assert.deepStrictEqual(w, [
    { day: 'Today', date: '29 Oct', icon: 'partly', label: 'Partly cloudy', hi: 17, lo: 11, rain: 10 },
    { day: 'Fri', date: '30 Oct', icon: 'rain', label: 'Rain', hi: 12, lo: 6, rain: 85 }
  ]);
});

test('weekView skips past days and is null without a row for today', () => {
  const w = Logic.weekView(data, new Date(2026, 9, 30, 9, 0));
  assert.deepStrictEqual(w.map(d => d.day), ['Today']);
  assert.strictEqual(w[0].date, '30 Oct');
  assert.strictEqual(Logic.weekView(data, new Date(2026, 9, 31, 9, 0)), null);
});

test('weekView tolerates missing rain chance', () => {
  const d = JSON.parse(JSON.stringify(data));
  delete d.daily.precipitation_probability_max;
  assert.strictEqual(Logic.weekView(d, new Date(2026, 9, 29, 10, 0))[0].rain, null);
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
      { order: ['hdmi1', 'netflix', 'youtube'], hidden: [], added: {}, ambientMin: 3, weather: true, background: 'alone' });
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
    ambientMin: 7, weather: 'no', background: 'gif'
  }, B);
  assert.deepStrictEqual(s.added, { 'app:foo': { label: 'Foo', appId: 'foo', icon: 'file:///foo.png' } });
  assert.deepStrictEqual(s.order, ['app:foo', 'hdmi1', 'netflix', 'youtube']);
  assert.strictEqual(s.ambientMin, 3);
  assert.strictEqual(s.weather, true);
  assert.strictEqual(s.background, 'alone');
});

test('normalizeSettings keeps valid display options and never hides every tile', () => {
  const s = Logic.normalizeSettings({ ambientMin: 0, weather: false, background: 'photos', hidden: ['hdmi1', 'netflix', 'youtube'] }, B);
  assert.strictEqual(s.ambientMin, 0);
  assert.strictEqual(s.weather, false);
  assert.strictEqual(s.background, 'photos');
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
