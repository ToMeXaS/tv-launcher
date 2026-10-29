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
