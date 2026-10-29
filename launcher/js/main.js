(function () {
  'use strict';
  var BG_COUNT = 10;
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var focus = 0;
  var inputMode = false;
  var pendingInput = false;
  var root = document.documentElement;
  var weatherData = null;
  var bgUrl = '';
  var weatherAt = 0;
  var WEATHER_MAX_AGE = 12 * 3600 * 1000;
  var WEATHER_REFRESH = 30 * 60 * 1000;
  var inputRequest = 0;
  var weatherFocused = false; // Up from the tiles focuses the weather card
  var weekOpen = false;
  var AMBIENT_AFTER = 3 * 60 * 1000; // idle time before only the photo and clock stay up
  var lastKey = Date.now();
  var ambient = false;

  function $(id) { return document.getElementById(id); }

  function loadFocus() {
    try {
      var v = parseInt(localStorage.getItem('focus'), 10);
      if (v >= 0 && v < TILES.length) return v;
    } catch (e) { /* storage unavailable */ }
    return 0;
  }

  function saveFocus() {
    try { localStorage.setItem('focus', String(focus)); } catch (e) { /* storage unavailable */ }
  }

  function renderTiles() {
    var row = $('tiles');
    row.innerHTML = '';
    TILES.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tile' + (t.glass ? ' glass' : '') + (t.light ? ' light' : '');
      if (t.bg) el.style.background = t.bg;
      el.innerHTML = '<div class="logo">' + Icons.app[t.logo] + '</div><div class="label">' + t.label + '</div>' +
        (i < 9 ? '<div class="num">' + (i + 1) + '</div>' : '');
      row.appendChild(el);
    });
    updateFocus();
  }

  function updateFocus() {
    var els = $('tiles').children;
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', !weatherFocused && i === focus);
    $('weather').classList.toggle('focused', weatherFocused);
  }

  function tick() {
    var now = new Date();
    $('clock').textContent = $('a-clock').textContent = Logic.formatTime(now);
    $('date').textContent = $('a-date').textContent = Logic.formatDate(now);
    $('greeting').textContent = Logic.greeting(now.getHours());
    setBackground();
    if (!ambient && !inputMode && !pendingInput && !document.hidden && Date.now() - lastKey > AMBIENT_AFTER) enterAmbient();
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
    if (weatherFocused) { weatherFocused = false; updateFocus(); }
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
    var url = 'url(bg/' + (Logic.isNight(now, weatherData) ? 'night/' : '') + (n < 10 ? '0' : '') + n + '.jpg)';
    if (url !== bgUrl) document.body.style.backgroundImage = bgUrl = url;
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
  }

  function activate() {
    var t = TILES[focus];
    saveFocus();
    if (t.appId) TV.launchApp(t.appId, showError);
    else {
      var id = ++inputRequest;
      pendingInput = true;
      TV.showInput(t.input, function () { enterInput(id); }, function (msg) { inputFailed(id, msg); });
    }
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
    var n = Logic.numberTile(k, TILES.length);
    if (n !== -1) { focus = n; weatherFocused = false; updateFocus(); activate(); return; }
    if (k === 38) { if (weatherData) { weatherFocused = true; updateFocus(); } }
    else if (k === 40 || ((k === 37 || k === 39) && weatherFocused)) { weatherFocused = false; updateFocus(); }
    else if (k === 37) { focus = Logic.moveFocus(focus, -1, TILES.length); updateFocus(); }
    else if (k === 39) { focus = Logic.moveFocus(focus, 1, TILES.length); updateFocus(); }
    else if (k === 13) { if (weatherFocused) openWeek(); else activate(); }
  });

  document.addEventListener('visibilitychange', function () {
    lastKey = Date.now();
    exitAmbient();
    if (document.hidden) { pendingInput = false; if (inputMode) exitInput(); closeWeek(); }
    else { refreshScreen(); refreshWeatherIfStale(); }
  });

  TV.registerNumberKeys();
  focus = loadFocus();
  renderTiles();
  refreshScreen();
  var cachedWeather = Weather.cached();
  if (cachedWeather) renderWeather(cachedWeather.data, cachedWeather.at);
  Weather.refresh(renderWeather);
  setInterval(tick, 10000);
  setInterval(function () { renderWeather(); }, 10 * 60 * 1000);
  setInterval(function () { Weather.refresh(renderWeather); }, WEATHER_REFRESH);
})();
