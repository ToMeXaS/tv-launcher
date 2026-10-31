var Settings = (function () {
  'use strict';
  var KEY = 'settings-v1';
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var SECTIONS = [
    { name: 'Home tiles', icon: 'tiles', about: 'Show, hide, reorder or remove the tiles on the home screen' },
    { name: 'Add apps', icon: 'add', about: 'Give any app installed on this TV its own tile' },
    { name: 'Display', icon: 'display', about: 'Ambient screen, weather and background' },
    { name: 'Location', icon: 'location', about: 'Where the weather is for, and which time zone the clock shows' },
    { name: 'Reset', icon: 'reset', about: 'Start over with the default tiles, display and location' }
  ];
  // Option rows: Left / Right step 'choice' rows through Logic.choices(key), OK opens them as a dropdown; 'toggle' rows flip.
  var DISPLAY = [
    { label: 'Ambient screen after', key: 'ambientMin', type: 'choice' },
    { label: 'Weather card', key: 'weather', type: 'toggle' },
    { label: 'Background', key: 'background', type: 'choice' }
  ];
  var LOCATION = [
    { label: 'Country', key: 'country', type: 'choice' },
    { label: 'City', key: 'city', type: 'choice' },
    { label: 'Time zone', key: 'timezone', type: 'choice' }
  ];
  var OPTIONS = { 2: DISPLAY, 3: LOCATION }; // sections made of Left / Right option rows
  var s = null; // current settings, always normalized
  var shown = false;
  var onClose = null;
  var level = 0; // 0: section list, 1: inside the section
  var sec = 0;
  var row = 0;
  var carrying = false;
  var menu = -1; // highlighted action while a tile's action menu is open, -1 when closed
  var pick = -1; // highlighted choice while an option row's dropdown is open, -1 when closed
  var apps = null; // installed apps, fetched the first time Add apps is entered
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
  function rowCount() { return [tileRows().length, appRows().length, DISPLAY.length, LOCATION.length, 1][sec]; }

  function tileActions(t) {
    var list = [{ id: 'hide', label: t.hidden ? 'Show on home screen' : 'Hide from home screen' }, { id: 'move', label: 'Move' }];
    if (t.added) list.push({ id: 'remove', label: 'Remove tile' });
    return list;
  }

  function open(cb) {
    onClose = cb;
    shown = true;
    level = sec = row = 0;
    menu = pick = -1;
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
    row = 0;
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

  function act() {
    var t = tileRows()[row], id = tileActions(t)[menu].id;
    menu = -1;
    if (id === 'move') { carrying = true; return; }
    var next = id === 'remove' ? Logic.removeApp(s, t.id) : Logic.toggleHidden(s, t.id);
    if (next === s) { note = 'At least one tile has to stay visible'; return; }
    save(next);
    if (id === 'remove') { row = Math.min(row, rowCount() - 1); note = 'Removed ' + t.label; }
  }

  function step(d, dir) {
    save(d.type === 'toggle' ? Logic.setOption(s, d.key, !s[d.key]) : Logic.stepOption(s, d.key, dir));
  }

  function press() {
    if (sec === 0) {
      menu = 0;
    } else if (sec === 1) {
      var a = appRows()[row];
      if (!a) return;
      save(Logic.addApp(s, a));
      row = Math.max(0, Math.min(row, rowCount() - 1));
      note = 'Added ' + a.label;
    } else if (OPTIONS[sec]) {
      var d = OPTIONS[sec][row];
      if (d.type === 'toggle') step(d, 1);
      else pick = Logic.choiceIndex(d.key, s[d.key], s);
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
    } else if (menu !== -1) {
      if (dir) menu = Logic.moveFocus(menu, dir, tileActions(tileRows()[row]).length);
      else if (k === 13) act();
      else if (isBack || k === 37) menu = -1;
    } else if (pick !== -1) {
      var o = OPTIONS[sec][row], list = Logic.choices(o.key, s);
      if (dir) pick = Logic.moveFocus(pick, dir, list.length);
      else if (k === 13) { save(Logic.chooseOption(s, o.key, list[pick].value)); pick = -1; }
      else if (isBack || k === 37) pick = -1;
    } else if (carrying) {
      if (dir) carry(dir);
      else if (k === 13 || isBack) carrying = false;
    } else if (OPTIONS[sec] && (k === 37 || k === 39)) {
      step(OPTIONS[sec][row], k === 39 ? 1 : -1);
    } else if (isBack || k === 37) {
      level = 0;
      confirmReset = false;
    } else if (dir) {
      if (rowCount()) row = Logic.moveFocus(row, dir, rowCount());
      confirmReset = false;
    } else if (k === 13) press();
    render();
  }

  function rowFocused(i) { return level === 1 && i === row; }

  function tilesPanel() {
    var n = 0;
    return tileRows().map(function (t, i) {
      var f = rowFocused(i), open = f && menu !== -1;
      var num = t.hidden ? '' : ++n <= 9 ? String(n) : '';
      return '<div class="srow' + (t.hidden ? ' off' : '') + (open ? ' open' : f && !carrying ? ' focused' : '') + (f && carrying ? ' carrying' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo(t) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(t.label) + '</span>' +
        '<span class="s-num">' + num + '</span>' +
        '<span class="s-value">' + (t.hidden ? 'Hidden' : 'Shown') + '</span>' +
        '<span class="s-more">' + (f && carrying ? Icons.move : '&#8943;') + '</span></div>' +
        (open ? actionMenu(t) : '');
    }).join('');
  }

  // Open menus and dropdowns list their choices as indented rows right under the row they belong to.
  function actionMenu(t) {
    return '<div class="s-choices">' + tileActions(t).map(function (a, i) {
      return '<div class="srow' + (i === menu ? ' focused' : '') + (a.id === 'remove' ? ' danger' : '') + '">' +
        '<span class="s-name">' + a.label + '</span></div>';
    }).join('') + '</div>';
  }

  function appsPanel() {
    if (appsError) return '<div class="s-msg">Couldn\'t list apps</div>';
    if (!apps) return '<div class="s-msg">' + (level === 1 ? 'Loading apps…' : 'Press OK to list the apps on this TV') + '</div>';
    var list = appRows();
    if (!list.length) return '<div class="s-msg">Every installed app already has a tile</div>';
    return list.map(function (a, i) {
      return '<div class="srow' + (rowFocused(i) ? ' focused' : '') + '">' +
        '<span class="s-logo">' + Icons.tileLogo({ added: true, label: a.label, icon: a.icon }) + '</span>' +
        '<span class="s-name">' + Logic.escapeHtml(a.label) + '</span><span class="s-value">Add</span></div>';
    }).join('');
  }

  function optionsPanel() {
    return OPTIONS[sec].map(function (d, i) {
      var open = rowFocused(i) && pick !== -1;
      var value = d.type === 'toggle' ? (s[d.key] ? 'On' : 'Off') : Logic.choices(d.key, s)[Logic.choiceIndex(d.key, s[d.key], s)].label;
      return '<div class="srow' + (open ? ' open' : rowFocused(i) ? ' focused' : '') + '"><span class="s-name">' + d.label + '</span>' +
        '<span class="s-pick"><span class="s-value">' + value + '</span>' +
        (d.type === 'toggle' ? '' : '<span class="s-chevron">' + Icons.chevron + '</span>') + '</span></div>' +
        (open ? dropdown(d.key) : '');
    }).join('');
  }

  function dropdown(key) {
    return '<div class="s-choices">' + Logic.choices(key, s).map(function (c, i) {
      var current = c.value === s[key];
      return '<div class="srow' + (i === pick ? ' focused' : '') + '"><span class="s-name">' + c.label + '</span>' +
        '<span class="s-tick">' + (current ? Icons.check : '') + '</span></div>';
    }).join('') + '</div>';
  }

  function resetPanel() {
    return '<div class="srow' + (rowFocused(0) ? ' focused' : '') + (confirmReset ? ' danger' : '') + '"><span class="s-name">' +
      (confirmReset ? 'Press OK again to confirm' : 'Reset tiles, display and location to defaults') + '</span></div>';
  }

  function hint() {
    if (level === 0) return 'Up / Down · section    OK · open    Back · close';
    if (menu !== -1 || pick !== -1) return 'Up / Down · choose    OK · select    Back · cancel';
    if (carrying) return 'Up / Down · move    OK · drop';
    if (sec === 1 && (!apps || appsError || !appRows().length)) return 'Back · sections';
    if (sec === 0) return 'OK · options    Back · sections';
    if (sec === 1) return 'OK · add    Back · sections';
    if (OPTIONS[sec]) return 'Left / Right · change    OK · list    Back · sections';
    return 'OK · select    Back · sections';
  }

  // Scrolls the panel just enough to show the focused row or choice, focus ring included.
  function keepInView(panel) {
    var el = panel.querySelector('.focused, .carrying');
    if (!el) { panel.scrollTop = 0; return; }
    var offset = el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    var top = offset - 8, bottom = offset + el.offsetHeight + 8;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (bottom > panel.scrollTop + panel.clientHeight) panel.scrollTop = bottom - panel.clientHeight;
  }

  function render() {
    $('s-nav').innerHTML = SECTIONS.map(function (x, i) {
      return '<div class="snav' + (i === sec ? ' active' : '') + (level === 0 && i === sec ? ' focused' : '') + '">' +
        '<span class="snav-icon">' + Icons.sections[x.icon] + '</span>' + x.name + '</div>';
    }).join('');
    $('s-head').innerHTML = '<div class="s-title">' + SECTIONS[sec].name + '</div><div class="s-about">' + SECTIONS[sec].about + '</div>';
    $('settings').classList.toggle('inside', level === 1);
    $('s-panel').innerHTML = [tilesPanel, appsPanel, optionsPanel, optionsPanel, resetPanel][sec]();
    $('s-hint').textContent = note || hint();
    keepInView($('s-panel'));
  }

  return { load: load, get: get, open: open, isOpen: isOpen, key: key };
})();
