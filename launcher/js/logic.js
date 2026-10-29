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

  // Remote digit keys 1-9 (keyCodes 49-57) pick a tile; -1 for anything else or past the last tile.
  function numberTile(keyCode, count) {
    var i = keyCode - 49;
    return i >= 0 && i < 9 && i < count ? i : -1;
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

  // Index of now's local date in data.daily.time ('YYYY-MM-DD'), or -1.
  function todayIndex(data, now) {
    var key = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var t = data.daily.time || [];
    return t.indexOf(key);
  }

  function sunLine(now, data, idx) {
    if (idx === undefined) idx = todayIndex(data, now);
    var d = data.daily;
    var sunrise = parseLocal(d.sunrise[idx]);
    var sunset = parseLocal(d.sunset[idx]);
    if (now < sunrise) return { kind: 'sunrise', text: 'Sunrise at ' + formatTime(sunrise) };
    if (now < sunset) return { kind: 'sunset', text: 'Sunset at ' + formatTime(sunset) };
    // tomorrow's row may be absent (data fetched yesterday); today's time is within minutes
    var next = d.sunrise[idx + 1] || d.sunrise[idx];
    return { kind: 'sunrise', text: 'Sunrise at ' + formatTime(parseLocal(next)) };
  }

  // Between sunset and sunrise when the weather data has today's row; otherwise 18:00-06:00.
  function isNight(now, data) {
    var idx = data ? todayIndex(data, now) : -1;
    if (idx === -1) return now.getHours() >= 18 || now.getHours() < 6;
    return now < parseLocal(data.daily.sunrise[idx]) || now >= parseLocal(data.daily.sunset[idx]);
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

  // Returns null when the data has no row for today (too old to show).
  function weatherView(data, now) {
    var idx = todayIndex(data, now);
    if (idx === -1) return null;
    var c = data.current;
    var info = weatherInfo(c.weather_code, c.is_day === 1);
    return {
      temp: Math.round(c.temperature_2m),
      label: info.label,
      sentence: info.sentence,
      icon: info.icon,
      hi: Math.round(data.daily.temperature_2m_max[idx]),
      lo: Math.round(data.daily.temperature_2m_min[idx]),
      feels: Math.round(c.apparent_temperature),
      wind: Math.round(c.wind_speed_10m),
      humidity: Math.round(c.relative_humidity_2m),
      sun: sunLine(now, data, idx),
      hours: nextHours(data, now, 6)
    };
  }

  var SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Daily rows from today onward; null when the data has no row for today.
  function weekView(data, now) {
    var idx = todayIndex(data, now);
    if (idx === -1) return null;
    var d = data.daily, rain = d.precipitation_probability_max, out = [];
    for (var i = idx; i < d.time.length; i++) {
      var date = parseLocal(d.time[i] + 'T00:00');
      var info = weatherInfo(d.weather_code[i], true);
      out.push({
        day: i === idx ? 'Today' : SHORT_DAYS[date.getDay()],
        date: date.getDate() + ' ' + SHORT_MONTHS[date.getMonth()],
        icon: info.icon,
        label: info.label,
        hi: Math.round(d.temperature_2m_max[i]),
        lo: Math.round(d.temperature_2m_min[i]),
        rain: rain && rain[i] != null ? Math.round(rain[i]) : null
      });
    }
    return out;
  }

  var Logic = {
    formatTime: formatTime, formatDate: formatDate, greeting: greeting,
    moveFocus: moveFocus, numberTile: numberTile, photoIndex: photoIndex, parseLocal: parseLocal,
    weatherInfo: weatherInfo, todayIndex: todayIndex, sunLine: sunLine, isNight: isNight, nextHours: nextHours, weatherView: weatherView,
    weekView: weekView
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
