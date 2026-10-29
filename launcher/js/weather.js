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
