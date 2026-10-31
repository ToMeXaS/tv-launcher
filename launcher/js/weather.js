var Weather = (function () {
  'use strict';
  var KEY = 'weather-v3'; // v3: cache remembers which place/time zone (URL) it is for
  var MAX_AGE = 12 * 3600 * 1000;

  // The cached forecast for url, or null when it is for another place or too old.
  function cached(url) {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (c && c.url === url && Date.now() - c.at < MAX_AGE) return { at: c.at, data: c.data };
    } catch (e) { /* no or bad cache */ }
    return null;
  }

  function refresh(url, onData) {
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var at = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify({ url: url, at: at, data: data })); } catch (e) { /* full */ }
      onData(data, at, url);
    }).catch(function () { /* keep showing cache, or nothing */ });
  }

  return { cached: cached, refresh: refresh };
})();
