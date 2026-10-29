(function () {
  'use strict';
  var BG_COUNT = 10;
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var tiles = []; // visible tiles in launch order
  var focus = 0;
  var zone = 'tiles'; // 'tiles', 'weather' (Up from the tiles) or 'gear' (Up again)
  var settings = null;
  var inputMode = false;
  var pendingInput = false;
  var root = document.documentElement;
  var weatherData = null;
  var bgUrl = '';
  var bgPeriod = ''; // Alone look currently playing, '' when the videos are off
  var aloneMissing = false; // the Alone files aren't in the repo (recorded locally), so a fresh copy uses the photos
  var weatherAt = 0;
  var WEATHER_MAX_AGE = 12 * 3600 * 1000;
  var WEATHER_REFRESH = 30 * 60 * 1000;
  var inputRequest = 0;
  var weekOpen = false;
  var lastKey = Date.now();
  var ambient = false;

  function $(id) { return document.getElementById(id); }

  function savedFocusId() {
    try {
      var id = localStorage.getItem('focus-id');
      if (id) return id;
      var idx = parseInt(localStorage.getItem('focus'), 10); // old version saved a tile index
      return idx >= 0 && idx < TILES.length ? TILES[idx].id : null;
    } catch (e) { return null; } // storage unavailable
  }

  function saveFocus() {
    try { localStorage.setItem('focus-id', tiles[focus].id); } catch (e) { /* storage unavailable */ }
  }

  function weatherShown() { return !!weatherData && settings.weather; }

  // Rebuilds the tile row from the settings, keeping focus on the same app when it is still shown.
  function applySettings() {
    var id = tiles.length ? tiles[focus].id : savedFocusId();
    settings = Settings.get();
    tiles = Logic.visibleTiles(settings, TILES);
    focus = 0;
    for (var i = 0; i < tiles.length; i++) if (tiles[i].id === id) focus = i;
    document.body.classList.toggle('weather-off', !settings.weather);
    if (zone === 'weather' && !weatherShown()) zone = 'tiles';
    renderTiles();
    setBackground();
  }

  function renderTiles() {
    var row = $('tiles');
    row.innerHTML = '';
    tiles.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tile' + (t.glass ? ' glass' : '') + (t.light ? ' light' : '');
      if (t.bg) el.style.background = t.bg;
      el.innerHTML = '<div class="logo">' + Icons.tileLogo(t) + '</div><div class="label">' + Logic.escapeHtml(t.label) + '</div>' +
        (i < 9 ? '<div class="num">' + (i + 1) + '</div>' : '');
      row.appendChild(el);
    });
    updateFocus();
  }

  function updateFocus() {
    var els = $('tiles').children;
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', zone === 'tiles' && i === focus);
    $('weather').classList.toggle('focused', zone === 'weather');
    $('gear').classList.toggle('focused', zone === 'gear');
  }

  function tick() {
    var now = new Date();
    $('clock').textContent = $('a-clock').textContent = Logic.formatTime(now);
    $('date').textContent = $('a-date').textContent = Logic.formatDate(now);
    $('greeting').textContent = Logic.greeting(now.getHours());
    setBackground();
    if (!ambient && settings.ambientMin && !inputMode && !pendingInput && !Settings.isOpen() && !document.hidden &&
      Date.now() - lastKey > settings.ambientMin * 60 * 1000) enterAmbient();
  }

  function enterAmbient() {
    closeWeek();
    ambient = true;
    root.classList.add('ambient');
  }

  function exitAmbient() {
    ambient = false;
    root.classList.remove('ambient');
  }

  function hideWeather() {
    weatherData = null;
    document.body.classList.add('no-weather');
    dropWeatherFocus();
  }

  function dropWeatherFocus() {
    closeWeek();
    if (zone === 'weather') { zone = 'tiles'; updateFocus(); }
  }

  function renderWeather(data, at) {
    if (data) { weatherData = data; weatherAt = at || Date.now(); }
    if (weatherData && Date.now() - weatherAt > WEATHER_MAX_AGE) weatherData = null;
    document.body.classList.toggle('no-weather', !weatherData);
    setBackground();
    if (!weatherData) { dropWeatherFocus(); return; }
    try {
      var v = Logic.weatherView(weatherData, new Date());
      if (v) drawWeather(v); else hideWeather();
      if (weekOpen) drawWeek();
    } catch (e) {
      hideWeather();
    }
  }

  function refreshWeatherIfStale() {
    if (Date.now() - weatherAt > WEATHER_REFRESH) Weather.refresh(renderWeather);
  }

  function drawWeather(v) {
    $('w-icon').innerHTML = $('a-icon').innerHTML = Icons.weather[v.icon];
    $('w-temp').textContent = $('a-temp').textContent = v.temp + '°';
    $('w-label').textContent = v.label;
    $('w-hilo').textContent = 'H ' + v.hi + '°  L ' + v.lo + '°';
    $('w-details').textContent = 'Feels ' + v.feels + '° · Wind ' + v.wind + ' km/h · Humidity ' + v.humidity + '%';
    $('w-hours').innerHTML = v.hours.map(function (h) {
      return '<div class="hour"><div class="t">' + h.time + '</div>' + Icons.weather[h.icon] + '<div>' + h.temp + '°</div></div>';
    }).join('');
    $('sentence').textContent = v.sentence;
    $('sun').innerHTML = Icons.sun + '<span>' + v.sun.text + '</span>';
  }

  function drawWeek() {
    var days = Logic.weekView(weatherData, new Date());
    if (!days) return false;
    $('week-days').innerHTML = days.map(function (d) {
      return '<div class="day"><div class="name">' + d.day + '</div><div class="date">' + d.date + '</div>' +
        Icons.weather[d.icon] + '<div class="label">' + d.label + '</div>' +
        '<div class="hi">' + d.hi + '°</div><div class="lo">' + d.lo + '°</div>' +
        (d.rain === null ? '' : '<div class="rain">' + d.rain + '% rain</div>') + '</div>';
    }).join('');
    return true;
  }

  function openWeek() {
    try { if (!weatherData || !drawWeek()) return; } catch (e) { return; }
    weekOpen = true;
    root.classList.add('week-open');
  }

  function closeWeek() {
    weekOpen = false;
    root.classList.remove('week-open');
  }

  // Called every tick so the night photo comes in at sunset; only touches the DOM when the photo changes.
  function setBackground() {
    var now = new Date();
    var n = Logic.photoIndex(now, BG_COUNT) + 1;
    var alone = settings.background === 'alone' && !aloneMissing;
    var url = alone ? 'url(bg/alone.jpg)' :
      'url(bg/' + (Logic.isNight(now, weatherData) ? 'night/' : '') + (n < 10 ? '0' : '') + n + '.jpg)';
    if (url !== bgUrl) document.body.style.backgroundImage = bgUrl = url;
    setVideo(alone ? Logic.alonePeriod(now) : '');
  }

  // Loads the period's loop into the idle video and crossfades to it once it plays; the still stays behind as a fallback.
  function setVideo(period) {
    if (period === bgPeriod) return;
    bgPeriod = period;
    var vids = document.querySelectorAll('#bgv video');
    var cur = vids[0].classList.contains('on') ? vids[0] : vids[1];
    var next = cur === vids[0] ? vids[1] : vids[0];
    if (!period) {
      for (var i = 0; i < vids.length; i++) { vids[i].classList.remove('on'); vids[i].pause(); vids[i].removeAttribute('src'); vids[i].load(); }
      return;
    }
    next.onplaying = function () {
      next.onplaying = null;
      next.classList.add('on');
      cur.classList.remove('on');
      setTimeout(function () { if (!cur.classList.contains('on')) cur.pause(); }, 2500);
    };
    next.src = 'bg/alone/' + period + '.mp4';
    next.play();
  }

  // Pauses the loop while the launcher is hidden or an input is showing.
  function syncVideo() {
    var v = document.querySelector('#bgv video.on');
    if (!v) return;
    if (document.hidden || inputMode) v.pause(); else v.play();
  }

  function showError(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showError.timer);
    showError.timer = setTimeout(function () { el.classList.remove('show'); }, 4000);
  }

  function enterInput(id) {
    if (id !== inputRequest) return; // superseded by a newer request
    if (!pendingInput) { TV.hideInput(); return; } // cancelled by Back while pending
    pendingInput = false;
    inputMode = true;
    root.classList.add('input-mode');
    syncVideo();
  }

  function inputFailed(id, msg) {
    if (id !== inputRequest) return;
    pendingInput = false;
    showError(msg);
  }

  function exitInput() {
    TV.hideInput();
    inputMode = false;
    root.classList.remove('input-mode');
    syncVideo();
  }

  function activate() {
    var t = tiles[focus];
    saveFocus();
    if (t.appId) TV.launchApp(t.appId, showError);
    else {
      var id = ++inputRequest;
      pendingInput = true;
      TV.showInput(t.input, function () { enterInput(id); }, function (msg) { inputFailed(id, msg); });
    }
  }

  function openSettings() {
    Settings.open(applySettings);
  }

  function refreshScreen() { tick(); renderWeather(); }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var isBack = BACK.indexOf(k) !== -1;
    if (isBack) e.preventDefault();
    lastKey = Date.now();
    if (ambient) { e.preventDefault(); exitAmbient(); return; } // the key that wakes the screen does nothing else
    if (pendingInput) { if (isBack) { pendingInput = false; TV.hideInput(); } return; }
    if (inputMode) { if (isBack) exitInput(); return; }
    if (weekOpen) { if (isBack || k === 13) closeWeek(); return; }
    if (Settings.isOpen()) { Settings.key(k); return; }
    var n = Logic.numberTile(k, tiles.length);
    if (n !== -1) { focus = n; zone = 'tiles'; updateFocus(); activate(); return; }
    if (k === 38) { zone = zone === 'tiles' && weatherShown() ? 'weather' : 'gear'; updateFocus(); }
    else if (k === 40) { zone = zone === 'gear' && weatherShown() ? 'weather' : 'tiles'; updateFocus(); }
    else if (zone === 'gear') { if (k === 13) openSettings(); }
    else if (zone === 'weather') {
      if (k === 13) openWeek();
      else if (k === 37 || k === 39) { zone = 'tiles'; updateFocus(); }
    }
    else if (k === 37) { focus = Logic.moveFocus(focus, -1, tiles.length); updateFocus(); }
    else if (k === 39) { focus = Logic.moveFocus(focus, 1, tiles.length); updateFocus(); }
    else if (k === 13) activate();
  });

  document.addEventListener('visibilitychange', function () {
    lastKey = Date.now();
    exitAmbient();
    syncVideo();
    if (document.hidden) { pendingInput = false; if (inputMode) exitInput(); closeWeek(); }
    else { refreshScreen(); refreshWeatherIfStale(); }
  });

  TV.registerNumberKeys();
  $('gear').innerHTML = Icons.gear;
  Settings.load();
  var aloneProbe = new Image();
  aloneProbe.onerror = function () { aloneMissing = true; setBackground(); };
  aloneProbe.src = 'bg/alone.jpg';
  applySettings();
  refreshScreen();
  var cachedWeather = Weather.cached();
  if (cachedWeather) renderWeather(cachedWeather.data, cachedWeather.at);
  Weather.refresh(renderWeather);
  setInterval(tick, 10000);
  setInterval(function () { renderWeather(); }, 10 * 60 * 1000);
  setInterval(function () { Weather.refresh(renderWeather); }, WEATHER_REFRESH);
})();
