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

  var TIMES = ['morning', 'day', 'evening', 'night'];
  var GOLDEN_HOURS = 2;

  // Night between sunset and sunrise, morning the first two hours after sunrise, evening the last two before sunset.
  // Uses today's sun times from the weather data when it has them; otherwise sunrise 06:00 and sunset 18:00.
  function timeOfDay(now, data) {
    var idx = data ? todayIndex(data, now) : -1;
    var rise = idx === -1 ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6) : parseLocal(data.daily.sunrise[idx]);
    var set = idx === -1 ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18) : parseLocal(data.daily.sunset[idx]);
    var hours = GOLDEN_HOURS * 3600000;
    if (now < rise || now >= set) return 'night';
    if (now - rise < hours) return 'morning';
    if (set - now <= hours) return 'evening';
    return 'day';
  }

  function timeLabel(time) { return time.charAt(0).toUpperCase() + time.slice(1); }

  // The times of day an imported picture shows at; pictures never changed show at all of them.
  function pictureTimes(s, name) { return s.pictureTimes[name] || TIMES; }

  function timesLabel(times) {
    if (times.length === TIMES.length) return 'Any time';
    return times.length ? times.map(timeLabel).join(' · ') : 'Never shown';
  }

  function togglePictureTime(s, name, time) {
    var cur = pictureTimes(s, name), on = cur.indexOf(time) === -1;
    var next = TIMES.filter(function (t) { return t === time ? on : cur.indexOf(t) !== -1; });
    var map = copyOf(s.pictureTimes);
    if (next.length === TIMES.length) delete map[name]; else map[name] = next;
    return setOption(s, 'pictureTimes', map);
  }

  function forgetPicture(s, name) {
    var map = copyOf(s.pictureTimes);
    delete map[name];
    return setOption(s, 'pictureTimes', map);
  }

  function picturesFor(pics, s, time) {
    return pics.filter(function (p) { return pictureTimes(s, p.name).indexOf(time) !== -1; });
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
    var d = data.daily, rain = d.precipitation_probability_max, mm = d.precipitation_sum, wind = d.wind_speed_10m_max, out = [];
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
        rain: rain && rain[i] != null ? Math.round(rain[i]) : null,
        mm: mm && mm[i] != null ? Math.round(mm[i] * 10) / 10 : null,
        wind: wind && wind[i] != null ? Math.round(wind[i]) : null
      });
    }
    return out;
  }

  // Chart points for weekView days: x at each column's centre across width, highs and lows on one
  // shared scale between pad and height - pad (warmest at the top).
  function weekChart(days, width, height, pad) {
    var max = Math.max.apply(null, days.map(function (d) { return d.hi; }));
    var min = Math.min.apply(null, days.map(function (d) { return d.lo; }));
    var span = max - min || 1;
    function y(t) { return Math.round(pad + (max - t) / span * (height - 2 * pad)); }
    return days.map(function (d, i) {
      return { x: Math.round((i + 0.5) * width / days.length), hi: y(d.hi), lo: y(d.lo) };
    });
  }

  // Settings picked from a dropdown, in menu order.
  var CHOICES = {
    ambientMin: [ // minutes; 0 = never
      { value: 0, label: 'Off' }, { value: 1, label: '1 min' }, { value: 3, label: '3 min' },
      { value: 5, label: '5 min' }, { value: 10, label: '10 min' }
    ],
    background: [ // 'photos' = rotating photos for the time of day, 'custom' = pictures imported in Settings → My pictures
      { value: 'photos', label: 'Photos' }, { value: 'custom', label: 'My pictures' }
    ]
  };

  // Weather locations: [country, [city, latitude, longitude, IANA time zone], ...]; the first city is the country's default.
  var PLACES = [
    ['Lithuania', ['Šiauliai', 55.93, 23.31, 'Europe/Vilnius'], ['Vilnius', 54.69, 25.28, 'Europe/Vilnius'],
      ['Kaunas', 54.90, 23.89, 'Europe/Vilnius'], ['Klaipėda', 55.71, 21.13, 'Europe/Vilnius'], ['Panevėžys', 55.73, 24.36, 'Europe/Vilnius']],
    ['Latvia', ['Riga', 56.95, 24.11, 'Europe/Riga'], ['Daugavpils', 55.87, 26.54, 'Europe/Riga'], ['Liepāja', 56.51, 21.01, 'Europe/Riga']],
    ['Estonia', ['Tallinn', 59.44, 24.75, 'Europe/Tallinn'], ['Tartu', 58.38, 26.72, 'Europe/Tallinn']],
    ['Poland', ['Warsaw', 52.23, 21.01, 'Europe/Warsaw'], ['Kraków', 50.06, 19.94, 'Europe/Warsaw'], ['Gdańsk', 54.35, 18.65, 'Europe/Warsaw'], ['Wrocław', 51.11, 17.04, 'Europe/Warsaw']],
    ['Finland', ['Helsinki', 60.17, 24.94, 'Europe/Helsinki'], ['Tampere', 61.50, 23.79, 'Europe/Helsinki']],
    ['Sweden', ['Stockholm', 59.33, 18.07, 'Europe/Stockholm'], ['Gothenburg', 57.71, 11.97, 'Europe/Stockholm']],
    ['Norway', ['Oslo', 59.91, 10.75, 'Europe/Oslo'], ['Bergen', 60.39, 5.32, 'Europe/Oslo']],
    ['Denmark', ['Copenhagen', 55.68, 12.57, 'Europe/Copenhagen'], ['Aarhus', 56.16, 10.20, 'Europe/Copenhagen']],
    ['Germany', ['Berlin', 52.52, 13.40, 'Europe/Berlin'], ['Munich', 48.14, 11.58, 'Europe/Berlin'], ['Hamburg', 53.55, 9.99, 'Europe/Berlin'], ['Frankfurt', 50.11, 8.68, 'Europe/Berlin']],
    ['Netherlands', ['Amsterdam', 52.37, 4.90, 'Europe/Amsterdam'], ['Rotterdam', 51.92, 4.48, 'Europe/Amsterdam']],
    ['United Kingdom', ['London', 51.51, -0.13, 'Europe/London'], ['Manchester', 53.48, -2.24, 'Europe/London'], ['Edinburgh', 55.95, -3.19, 'Europe/London']],
    ['Ireland', ['Dublin', 53.35, -6.26, 'Europe/Dublin'], ['Cork', 51.90, -8.47, 'Europe/Dublin']],
    ['France', ['Paris', 48.86, 2.35, 'Europe/Paris'], ['Lyon', 45.76, 4.84, 'Europe/Paris'], ['Marseille', 43.30, 5.37, 'Europe/Paris']],
    ['Spain', ['Madrid', 40.42, -3.70, 'Europe/Madrid'], ['Barcelona', 41.39, 2.17, 'Europe/Madrid'], ['Valencia', 39.47, -0.38, 'Europe/Madrid']],
    ['Portugal', ['Lisbon', 38.72, -9.14, 'Europe/Lisbon'], ['Porto', 41.15, -8.61, 'Europe/Lisbon']],
    ['Italy', ['Rome', 41.90, 12.50, 'Europe/Rome'], ['Milan', 45.46, 9.19, 'Europe/Rome'], ['Naples', 40.85, 14.27, 'Europe/Rome']],
    ['Czechia', ['Prague', 50.08, 14.44, 'Europe/Prague'], ['Brno', 49.20, 16.61, 'Europe/Prague']],
    ['Ukraine', ['Kyiv', 50.45, 30.52, 'Europe/Kyiv'], ['Lviv', 49.84, 24.03, 'Europe/Kyiv']],
    ['United States', ['New York', 40.71, -74.01, 'America/New_York'], ['Chicago', 41.88, -87.63, 'America/Chicago'],
      ['Denver', 39.74, -104.99, 'America/Denver'], ['Los Angeles', 34.05, -118.24, 'America/Los_Angeles']],
    ['Canada', ['Toronto', 43.65, -79.38, 'America/Toronto'], ['Vancouver', 49.28, -123.12, 'America/Vancouver']],
    ['Japan', ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'], ['Osaka', 34.69, 135.50, 'Asia/Tokyo']],
    ['Australia', ['Sydney', -33.87, 151.21, 'Australia/Sydney'], ['Melbourne', -37.81, 144.96, 'Australia/Melbourne']]
  ];

  // UTC plus every zone a place uses, in place order; 'auto' (the city's zone) is offered first.
  var ZONES = ['UTC'];
  PLACES.forEach(function (p) {
    for (var i = 1; i < p.length; i++) if (ZONES.indexOf(p[i][3]) === -1) ZONES.push(p[i][3]);
  });

  function countryRow(country) {
    for (var i = 0; i < PLACES.length; i++) if (PLACES[i][0] === country) return PLACES[i];
    return null;
  }

  // { country, city, lat, lon, tz } for the saved place, falling back to the country's first city.
  function place(s) {
    var row = countryRow(s.country) || PLACES[0], c = row[1];
    for (var i = 1; i < row.length; i++) if (row[i][0] === s.city) c = row[i];
    return { country: row[0], city: c[0], lat: c[1], lon: c[2], tz: c[3] };
  }

  function timeZone(s) { return s.timezone === 'auto' ? place(s).tz : s.timezone; }

  function zoneLabel(tz) { return tz.replace(/_/g, ' '); }

  // Country, city and time zone lists depend on the saved settings s; the rest are fixed.
  function choices(key, s) {
    if (key === 'country') return PLACES.map(function (p) { return { value: p[0], label: p[0] }; });
    if (key === 'city') {
      return (countryRow(s.country) || PLACES[0]).slice(1).map(function (c) { return { value: c[0], label: c[0] }; });
    }
    if (key === 'timezone') {
      return [{ value: 'auto', label: 'City (' + zoneLabel(place(s).tz) + ')' }].concat(ZONES.map(function (z) {
        return { value: z, label: zoneLabel(z) };
      }));
    }
    return CHOICES[key];
  }

  function choiceIndex(key, value, s) {
    var list = choices(key, s);
    for (var i = 0; i < list.length; i++) if (list[i].value === value) return i;
    return -1;
  }

  // The choice dir (+1/-1) steps away from value, wrapping around the list.
  function stepChoice(key, value, dir, s) {
    var list = choices(key, s), n = list.length;
    return list[((choiceIndex(key, value, s) + dir) % n + n) % n].value;
  }

  // Sets a dropdown setting; a new country starts at its first city.
  function chooseOption(s, key, value) {
    var r = setOption(s, key, value);
    if (key === 'country' && value !== s.country) r.city = countryRow(value)[1][0];
    return r;
  }

  function stepOption(s, key, dir) { return chooseOption(s, key, stepChoice(key, s[key], dir, s)); }

  var zoneFormats = {};

  // date's wall-clock time in tz, as a local Date, so getHours() and friends read that zone's time.
  // Unknown zones (or no Intl time zone support) leave date unchanged.
  function zonedDate(date, tz) {
    try {
      var f = zoneFormats[tz] || (zoneFormats[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      }));
      var p = {};
      f.formatToParts(date).forEach(function (x) { p[x.type] = +x.value; });
      return new Date(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    } catch (e) {
      return date;
    }
  }

  // Open-Meteo forecast for the saved place, with times in the chosen zone.
  function weatherUrl(s) {
    var p = place(s);
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
      '&timezone=' + encodeURIComponent(timeZone(s)) + '&forecast_days=7&wind_speed_unit=kmh' +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
      '&hourly=temperature_2m,weather_code,is_day' +
      '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,weather_code,precipitation_probability_max,' +
      'precipitation_sum,wind_speed_10m_max';
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
      background: choiceIndex('background', s.background) !== -1 ? s.background : 'photos',
      country: countryRow(s.country) ? s.country : PLACES[0][0],
      city: countryRow(s.country) ? place(s).city : PLACES[0][1][0],
      timezone: s.timezone === 'auto' || ZONES.indexOf(s.timezone) !== -1 ? s.timezone : 'auto',
      pictureTimes: normalizeTimes(s.pictureTimes)
    };
  }

  // { picture name: [times of day] }, keeping only known times in TIMES order.
  function normalizeTimes(raw) {
    var r = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return r;
    Object.keys(raw).forEach(function (name) {
      if (Array.isArray(raw[name])) r[name] = TIMES.filter(function (t) { return raw[name].indexOf(t) !== -1; });
    });
    return r;
  }

  // Settings fields each Reset row puts back; 'all' is every field.
  var PARTS = {
    tiles: ['order', 'hidden', 'added'],
    display: ['ambientMin', 'weather', 'background'],
    location: ['country', 'city', 'timezone']
  };

  function partKeys(part, s) { return PARTS[part] || Object.keys(s); }

  function resetPart(s, part, builtins) {
    var d = normalizeSettings(null, builtins), r = copyOf(s);
    partKeys(part, d).forEach(function (k) { r[k] = d[k]; });
    return r;
  }

  function isDefault(s, part, builtins) {
    var d = normalizeSettings(null, builtins);
    return partKeys(part, d).every(function (k) { return JSON.stringify(s[k]) === JSON.stringify(d[k]); });
  }

  function builtinById(builtins, id) {
    for (var i = 0; i < builtins.length; i++) if (builtins[i].id === id) return builtins[i];
    return null;
  }

  // Every tile in launch order: built-ins copied, added apps built from what was saved, each with a hidden flag.
  function allTiles(s, builtins) {
    return s.order.map(function (id) {
      var b = builtinById(builtins, id), a = s.added[id];
      var t = b ? copyOf(b) : { id: id, label: a.label, appId: a.appId, icon: a.icon, added: true };
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

  // Pictures the TV can show as a background; macOS '._' resource forks on USB sticks share the extension but aren't images.
  function isPicture(name) {
    return /\.(jpe?g|png|webp|bmp|gif)$/i.test(name) && name.slice(0, 2) !== '._';
  }

  // A picture's file name with the characters that would break a file URL or a CSS url("...") replaced.
  function safeName(name) {
    return String(name).replace(/["'\\/#%?()<>&\u0000-\u001f]/g, '_');
  }

  // Sorted by name, case-insensitively, so the rotation order matches what the list in Settings shows.
  function byName(a, b) {
    var x = a.name.toLowerCase(), y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
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
    moveFocus: moveFocus, numberTile: numberTile, photoIndex: photoIndex, parseLocal: parseLocal,
    weatherInfo: weatherInfo, todayIndex: todayIndex, sunLine: sunLine, timeOfDay: timeOfDay, nextHours: nextHours, weatherView: weatherView,
    weekView: weekView, weekChart: weekChart,
    normalizeSettings: normalizeSettings, resetPart: resetPart, isDefault: isDefault, allTiles: allTiles, visibleTiles: visibleTiles, moveTile: moveTile,
    toggleHidden: toggleHidden, addApp: addApp, removeApp: removeApp, availableApps: availableApps, isUserApp: isUserApp,
    choices: choices, choiceIndex: choiceIndex, stepChoice: stepChoice, stepOption: stepOption, chooseOption: chooseOption, setOption: setOption, escapeHtml: escapeHtml,
    place: place, timeZone: timeZone, zonedDate: zonedDate, weatherUrl: weatherUrl, isPicture: isPicture, safeName: safeName, byName: byName,
    TIMES: TIMES, timeLabel: timeLabel, pictureTimes: pictureTimes, timesLabel: timesLabel, togglePictureTime: togglePictureTime,
    forgetPicture: forgetPicture, picturesFor: picturesFor
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(this);
