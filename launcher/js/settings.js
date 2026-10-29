var Settings = (function () {
  'use strict';
  var KEY = 'settings-v1';
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var SECTIONS = ['Tiles', 'Add app', 'Display', 'Reset'];
  var s = null; // current settings, always normalized
  var shown = false;
  var onClose = null;
  var level = 0; // 0: section list, 1: inside the section
  var sec = 0;
  var row = 0;
  var col = 0; // Tiles rows: 0 the row, 1 move handle, 2 remove button (added apps only)
  var carrying = false;
  var apps = null; // installed apps, fetched the first time Add app is entered
  var appsError = false;
  var confirmReset = false;
  var note = ''; // one-off message in the hint line, cleared by the next key

  function $(id) { return document.getElementById(id); }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* none or unreadable */ }
    s = Logic.normalizeSettings(raw, TILES);
  }

  function get() { return s; }

  function save(next) {
    s = next;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable: lasts this session */ }
  }

  function tileRows() { return Logic.allTiles(s, TILES); }
  function appRows() { return apps ? Logic.availableApps(apps, s, TILES) : []; }
  function rowCount() { return [tileRows().length, appRows().length, 2, 1][sec]; }
  function maxCol() { return sec !== 0 ? 0 : tileRows()[row].added ? 2 : 1; }

  function open(cb) {
    onClose = cb;
    shown = true;
    level = sec = row = col = 0;
    carrying = confirmReset = appsError = false;
    apps = null;
    note = '';
    document.documentElement.classList.add('settings-open');
    render();
  }

  function close() {
    shown = false;
    document.documentElement.classList.remove('settings-open');
    onClose();
  }

  function isOpen() { return shown; }

  function enter() {
    level = 1;
    row = col = 0;
    confirmReset = false;
    if (sec === 1 && !apps && !appsError) {
      TV.listApps(function (list) { apps = list; render(); }, function () { appsError = true; render(); });
    }
  }

  function carry(dir) {
    var id = tileRows()[row].id;
    save(Logic.moveTile(s, id, dir));
    row = s.order.indexOf(id);
  }

  function press() {
    var next;
    if (sec === 0) {
      var t = tileRows()[row];
      if (col === 1) { carrying = true; return; }
      next = col === 2 ? Logic.removeApp(s, t.id) : Logic.toggleHidden(s, t.id);
      if (next === s) { note = 'At least one tile has to stay visible'; return; }
      save(next);
      if (col === 2) { row = Math.min(row, rowCount() - 1); col = 0; note = 'Removed ' + t.label; }
    } else if (sec === 1) {
      var a = appRows()[row];
      if (!a) return;
      save(Logic.addApp(s, a));
      row = Math.max(0, Math.min(row, rowCount() - 1));
      note = 'Added ' + a.label;
    } else if (sec === 2) {
      save(row === 0 ? Logic.setOption(s, 'ambientMin', Logic.nextAmbient(s.ambientMin)) : Logic.setOption(s, 'weather', !s.weather));
    } else if (!confirmReset) {
      confirmReset = true;
    } else {
      save(Logic.normalizeSettings(null, TILES));
      confirmReset = false;
      note = 'Back to defaults';
    }
  }

  function key(k) {
    var isBack = BACK.indexOf(k) !== -1;
    var dir = k === 38 ? -1 : k === 40 ? 1 : 0;
    note = '';
    if (level === 0) {
      if (isBack) { close(); return; }
      if (dir) sec = Logic.moveFocus(sec, dir, SECTIONS.length);
      else if (k === 39 || k === 13) enter();
    } else if (carrying) {
      if (dir) carry(dir);
      else if (k === 13 || isBack) carrying = false;
    } else if (isBack || (k === 37 && col === 0)) {
      level = 0;
      confirmReset = false;
    } else if (dir) {
      if (rowCount()) row = Logic.moveFocus(row, dir, rowCount());
      col = 0;
      confirmReset = false;
    } else if (k === 37) col--;
    else if (k === 39) col = Math.min(col + 1, maxCol());
    else if (k === 13) press();
    render();
  }

  function rowFocused(i) { return level === 1 && i === row; }

  function tilesPanel() {
    var n = 0;
    return tileRows().map(function (t, i) {
      var f = rowFocused(i);
      var num = t.hidden ? '' : ++n <= 9 ? String(n) : '';
      return '<div class="srow' + (t.hidden ? ' off' : '') + (f && col === 0 ? ' focused' : '') + (f && carrying ? ' carrying' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo(t) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(t.label) + '</span>' +
        '<span class="s-num">' + num + '</span>' +
        '<span class="s-value">' + (t.hidden ? 'Hidden' : 'Shown') + '</span>' +
        '<span class="s-btn' + (f && col === 1 ? ' focused' : '') + '">' + Icons.move + '</span>' +
        (t.added ? '<span class="s-btn' + (f && col === 2 ? ' focused' : '') + '">' + Icons.remove + '</span>' : '<span class="s-btn blank"></span>') +
        '</div>';
    }).join('');
  }

  function appsPanel() {
    if (appsError) return '<div class="s-msg">Couldn\'t list apps</div>';
    if (!apps) return '<div class="s-msg">' + (level === 1 ? 'Loading apps…' : 'Apps installed on this TV') + '</div>';
    var list = appRows();
    if (!list.length) return '<div class="s-msg">Every installed app already has a tile</div>';
    return list.map(function (a, i) {
      return '<div class="srow' + (rowFocused(i) ? ' focused' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo({ added: true, label: a.label, icon: a.icon }) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(a.label) + '</span><span class="s-value">Add</span></div>';
    }).join('');
  }

  function displayPanel() {
    return [
      ['Ambient screen after', s.ambientMin ? s.ambientMin + ' min' : 'Off'],
      ['Weather card', s.weather ? 'On' : 'Off']
    ].map(function (r, i) {
      return '<div class="srow' + (rowFocused(i) ? ' focused' : '') + '"><span class="s-name">' + r[0] + '</span>' +
        '<span class="s-value">' + r[1] + '</span></div>';
    }).join('');
  }

  function resetPanel() {
    return '<div class="srow' + (rowFocused(0) ? ' focused' : '') + '"><span class="s-name">' +
      (confirmReset ? 'Press OK again to confirm' : 'Reset tiles and display to defaults') + '</span></div>';
  }

  function hint() {
    if (level === 0) return 'OK · open    Back · close';
    if (carrying) return 'Up / Down · move    OK · drop';
    if (sec === 1 && (!apps || appsError || !appRows().length)) return 'Back · sections';
    if (sec === 1) return 'OK · add    Back · sections';
    if (sec !== 0) return 'OK · select    Back · sections';
    if (col === 0) return 'OK · show / hide    Right · move';
    if (col === 1) return 'OK · pick up' + (maxCol() === 2 ? '    Right · remove' : '');
    return 'OK · remove';
  }

  // Scrolls the panel just enough to show the focused row, focus ring included.
  function keepInView(panel) {
    var el = panel.querySelector('.focused');
    if (!el) { panel.scrollTop = 0; return; }
    if (!el.classList.contains('srow')) el = el.parentNode;
    var top = el.offsetTop - 8, bottom = el.offsetTop + el.offsetHeight + 8;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }

  function render() {
    $('s-nav').innerHTML = SECTIONS.map(function (name, i) {
      return '<div class="snav' + (i === sec ? ' active' : '') + (level === 0 && i === sec ? ' focused' : '') + '">' + name + '</div>';
    }).join('');
    $('s-panel').innerHTML = [tilesPanel, appsPanel, displayPanel, resetPanel][sec]();
    $('s-hint').textContent = note || hint();
    keepInView($('s-panel'));
  }

  return { load: load, get: get, open: open, isOpen: isOpen, key: key };
})();
