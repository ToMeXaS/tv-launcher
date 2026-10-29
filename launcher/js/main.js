(function () {
  'use strict';
  var BG_COUNT = 10;
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var focus = 0;
  var inputMode = false;
  var weatherData = null;

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
    TILES.forEach(function (t) {
      var el = document.createElement('div');
      el.className = 'tile' + (t.glass ? ' glass' : '') + (t.light ? ' light' : '');
      if (t.bg) el.style.background = t.bg;
      el.innerHTML = '<div class="logo">' + Icons.app[t.logo] + '</div><div class="label">' + t.label + '</div>';
      row.appendChild(el);
    });
    updateFocus();
  }

  function updateFocus() {
    var els = $('tiles').children;
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('focused', i === focus);
  }

  function tick() {
    var now = new Date();
    $('clock').textContent = Logic.formatTime(now);
    $('date').textContent = Logic.formatDate(now);
    $('greeting').textContent = Logic.greeting(now.getHours());
  }

  function renderWeather(data) {
    if (data) weatherData = data;
    document.body.classList.toggle('no-weather', !weatherData);
    if (!weatherData) return;
    var v = Logic.weatherView(weatherData, new Date());
    $('w-icon').innerHTML = Icons.weather[v.icon];
    $('w-temp').textContent = v.temp + '°';
    $('w-label').textContent = v.label;
    $('w-hilo').textContent = 'H ' + v.hi + '°  L ' + v.lo + '°';
    $('w-details').textContent = 'Feels ' + v.feels + '° · Wind ' + v.wind + ' km/h · Humidity ' + v.humidity + '%';
    $('w-hours').innerHTML = v.hours.map(function (h) {
      return '<div class="hour"><div class="t">' + h.time + '</div>' + Icons.weather[h.icon] + '<div>' + h.temp + '°</div></div>';
    }).join('');
    $('sentence').textContent = v.sentence;
    $('sun').innerHTML = Icons.sun + '<span>' + v.sun.text + '</span>';
  }

  function setBackground() {
    var n = Logic.photoIndex(new Date(), BG_COUNT) + 1;
    document.body.style.backgroundImage = 'url(bg/' + (n < 10 ? '0' : '') + n + '.jpg)';
  }

  function showError(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(showError.timer);
    showError.timer = setTimeout(function () { el.classList.remove('show'); }, 4000);
  }

  function enterInput() { inputMode = true; document.body.classList.add('input-mode'); }

  function exitInput() {
    TV.hideInput();
    inputMode = false;
    document.body.classList.remove('input-mode');
  }

  function activate() {
    var t = TILES[focus];
    saveFocus();
    if (t.appId) TV.launchApp(t.appId, showError);
    else TV.showInput(t.input, enterInput, showError);
  }

  function refreshScreen() { tick(); setBackground(); renderWeather(); }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var isBack = BACK.indexOf(k) !== -1;
    if (isBack) e.preventDefault();
    if (inputMode) { if (isBack) exitInput(); return; }
    if (k === 37) { focus = Logic.moveFocus(focus, -1, TILES.length); updateFocus(); }
    else if (k === 39) { focus = Logic.moveFocus(focus, 1, TILES.length); updateFocus(); }
    else if (k === 13) activate();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (inputMode) exitInput(); }
    else refreshScreen();
  });

  focus = loadFocus();
  renderTiles();
  refreshScreen();
  renderWeather(Weather.cached());
  Weather.refresh(renderWeather);
  setInterval(tick, 10000);
  setInterval(function () { renderWeather(); }, 10 * 60 * 1000);
  setInterval(function () { Weather.refresh(renderWeather); }, 30 * 60 * 1000);
})();
