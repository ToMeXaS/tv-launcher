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
