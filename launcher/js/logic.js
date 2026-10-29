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
    return 'Good evening.'; // through to 05:00: "Good night" reads like a goodbye
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

  // Which look of the Alone scene to show; same hours as the wallpaper's own settings.
  function alonePeriod(d) {
    var h = d.getHours();
    return h < 4 ? 'night' : h < 9 ? 'morning' : h < 17 ? 'day' : h < 20 ? 'dusk' : 'night';
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

  // Settings picked from a dropdown, in menu order.
  var CHOICES = {
    ambientMin: [ // minutes; 0 = never
      { value: 0, label: 'Off' }, { value: 1, label: '1 min' }, { value: 3, label: '3 min' },
      { value: 5, label: '5 min' }, { value: 10, label: '10 min' }
    ],
    background: [ // 'alone' = the PC's Wallpaper Engine scene, 'photos' = rotating day/night photos
      { value: 'alone', label: 'Alone' }, { value: 'photos', label: 'Photos' }
    ]
  };

  function choices(key) { return CHOICES[key]; }

  function choiceIndex(key, value) {
    for (var i = 0; i < CHOICES[key].length; i++) if (CHOICES[key][i].value === value) return i;
    return -1;
  }

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
    var defaultHidden = builtins.filter(function (t) { return t.off; }).map(function (t) { return t.id; });
    (Array.isArray(s.hidden) ? s.hidden : defaultHidden).forEach(function (id) {
      if (order.indexOf(id) !== -1 && hidden.indexOf(id) === -1) hidden.push(id);
    });
    if (hidden.length === order.length) hidden = [];
    return {
      order: order,
      hidden: hidden,
      added: added,
      ambientMin: choiceIndex('ambientMin', s.ambientMin) !== -1 ? s.ambientMin : 3,
      weather: typeof s.weather === 'boolean' ? s.weather : true,
      background: choiceIndex('background', s.background) !== -1 ? s.background : 'alone'
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

  var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return HTML_ESCAPES[c]; });
  }

  // Internal Samsung apps that pass the icon test but are not user-facing.
  var INTERNAL_APPS = ['com.samsung.tv.CSBilling', 'com.samsung.tv.quickpanel'];

  // Real apps ship an icon at /opt/usr/apps/<pkg>/shared/res/<appId>.(png|jpg|jpeg); system packages do not.
  function isUserApp(app) {
    if (!app || !app.appId || INTERNAL_APPS.indexOf(app.appId) !== -1) return false;
    var m = /^(?:file:\/\/)?\/opt\/usr\/apps\/[^\/]+\/shared\/res\/([^\/]+)\.(?:png|jpe?g)$/i.exec(app.icon || '');
    return !!m && m[1] === app.appId;
  }

  var Logic = {
    formatTime: formatTime, formatDate: formatDate, greeting: greeting,
    moveFocus: moveFocus, numberTile: numberTile, photoIndex: photoIndex, alonePeriod: alonePeriod, parseLocal: parseLocal,
    weatherInfo: weatherInfo, todayIndex: todayIndex, sunLine: sunLine, isNight: isNight, nextHours: nextHours, weatherView: weatherView,
    weekView: weekView,
    normalizeSettings: normalizeSettings, allTiles: allTiles, visibleTiles: visibleTiles, moveTile: moveTile,
    toggleHidden: toggleHidden, addApp: addApp, removeApp: removeApp, availableApps: availableApps, isUserApp: isUserApp,
    choices: choices, choiceIndex: choiceIndex, setOption: setOption, escapeHtml: escapeHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
