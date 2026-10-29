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
