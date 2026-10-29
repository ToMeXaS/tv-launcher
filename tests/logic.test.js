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
