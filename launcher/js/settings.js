var Settings = (function () {
  'use strict';
  var KEY = 'settings-v1';
  var BACK = [10009, 8, 27]; // Tizen Back; Backspace/Escape when previewing in a browser
  var SECTIONS = [
    { name: 'Home tiles', icon: 'tiles', about: 'Show, hide, reorder or remove the tiles on the home screen' },
    { name: 'Add apps', icon: 'add', about: 'Give any app installed on this TV its own tile' },
    { name: 'Display', icon: 'display', about: 'Ambient screen, weather and background' },
    { name: 'My pictures', icon: 'pictures', about: 'Import pictures from a USB stick to use as the background, and pick the times of day each one shows' },
    { name: 'Location', icon: 'location', about: 'Where the weather is for, and which time zone the clock shows' },
    { name: 'Reset', icon: 'reset', about: 'Put a part of the launcher back to how it came, or clear My pictures' }
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
  var PICTURES = 3;
  // Reset rows: Logic.resetPart parts, plus My pictures, which deletes the imported files.
  var RESETS = [
    { part: 'tiles', icon: 'tiles', label: 'Home tiles' },
    { part: 'display', icon: 'display', label: 'Display' },
    { part: 'location', icon: 'location', label: 'Location' },
    { part: 'pictures', icon: 'pictures', label: 'My pictures' },
    { part: 'all', icon: 'reset', label: 'All settings' }
  ];
  var OPTIONS = { 2: DISPLAY, 4: LOCATION }; // sections made of Left / Right option rows
  var s = null; // current settings, always normalized
  var shown = false;
  var onClose = null;
  var level = 0; // 0: section list, 1: inside the section
  var sec = 0;
  var row = 0;
  var carrying = false;
  var menu = -1; // highlighted action while a tile's or picture's action menu is open, -1 when closed
  var pick = -1; // highlighted choice while an option row's dropdown is open, -1 when closed
  var apps = null; // installed apps, fetched the first time Add apps is entered
  var appsError = false;
  var confirmReset = -1; // Reset row waiting for a second OK
  var usb = null; // pictures found on the USB stick while browsing it, 'loading' while it is read, null when not browsing
  var busy = false; // a picture is being copied or deleted
  var confirmRemove = -1; // My pictures row whose Remove action is waiting for a second OK
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
  // My pictures rows: the import row, then the imported pictures; while browsing the stick, what is on it.
  function pictureRows() { return usb === 'loading' ? [] : usb || [null].concat(Pictures.all()); }
  function rowCount() { return [tileRows().length, appRows().length, DISPLAY.length, pictureRows().length, LOCATION.length, RESETS.length][sec]; }

  function tileActions(t) {
    var list = [{ id: 'hide', label: t.hidden ? 'Show on home screen' : 'Hide from home screen' }, { id: 'move', label: 'Move' }];
    if (t.added) list.push({ id: 'remove', label: 'Remove tile' });
    return list;
  }

  // A picture's menu: a switch for each time of day, then Remove.
  function pictureActions(p) {
    var times = Logic.pictureTimes(s, p.name);
    return Logic.TIMES.map(function (t) {
      return { id: t, label: Logic.timeLabel(t), on: times.indexOf(t) !== -1 };
    }).concat([{ id: 'remove', label: confirmRemove === row ? 'Press OK again to remove' : 'Remove picture' }]);
  }

  function menuActions() { return sec === 0 ? tileActions(tileRows()[row]) : pictureActions(pictureRows()[row]); }

  function open(cb) {
    onClose = cb;
    shown = true;
    level = sec = row = 0;
    menu = pick = -1;
    carrying = appsError = busy = false;
    apps = usb = null;
    confirmRemove = confirmReset = -1;
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
    confirmReset = -1;
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
    if (sec === PICTURES) { actPicture(); return; }
    var t = tileRows()[row], id = tileActions(t)[menu].id;
    menu = -1;
    if (id === 'move') { carrying = true; return; }
    var next = id === 'remove' ? Logic.removeApp(s, t.id) : Logic.toggleHidden(s, t.id);
    if (next === s) { note = 'At least one tile has to stay visible'; return; }
    save(next);
    if (id === 'remove') { row = Math.min(row, rowCount() - 1); note = 'Removed ' + t.label; }
  }

  function browseUsb() {
    usb = 'loading';
    row = 0;
    Pictures.scanUsb(function (list) {
      if (usb !== 'loading') return; // left while it was reading
      if (!list.length) { usb = null; note = 'No pictures on the USB stick'; }
      else usb = list;
      render();
    }, function (msg) {
      if (usb !== 'loading') return;
      usb = null;
      note = msg;
      render();
    });
  }

  // Copies the picture into the app and makes My pictures the background.
  function importPicture(p) {
    busy = true;
    note = 'Importing ' + p.name + '…';
    Pictures.add(p, function () {
      busy = false;
      note = 'Imported ' + p.name;
      if (s.background !== 'custom') { save(Logic.setOption(s, 'background', 'custom')); note += ' · background set to My pictures'; }
      render();
    }, function (msg) {
      busy = false;
      note = 'Couldn\'t import ' + p.name + ': ' + msg;
      render();
    });
  }

  function pressPicture() {
    if (busy) return;
    var p = pictureRows()[row];
    if (usb) { if (!Pictures.has(p.name)) importPicture(p); return; }
    if (!p) { browseUsb(); return; }
    menu = 0;
  }

  // Time-of-day actions switch on the spot and keep the menu open; Remove needs a second OK.
  function actPicture() {
    var p = pictureRows()[row], id = pictureActions(p)[menu].id;
    if (id !== 'remove') { save(Logic.togglePictureTime(s, p.name, id)); return; }
    if (busy) return;
    if (confirmRemove !== row) { confirmRemove = row; return; }
    busy = true;
    confirmRemove = -1;
    menu = -1;
    Pictures.remove(p.name, function () {
      busy = false;
      save(Logic.forgetPicture(s, p.name));
      row = Math.min(row, rowCount() - 1);
      note = 'Removed ' + p.name;
      render();
    }, function (msg) {
      busy = false;
      note = 'Couldn\'t remove ' + p.name + ': ' + msg;
      render();
    });
  }

  function isReset(r) { return r.part === 'pictures' ? !Pictures.all().length : Logic.isDefault(s, r.part, TILES); }

  // First OK arms the row, the second resets it.
  function pressReset() {
    var r = RESETS[row];
    if (busy) return;
    if (isReset(r)) { note = r.part === 'pictures' ? 'No pictures to delete' : r.label + ' already at defaults'; return; }
    if (confirmReset !== row) { confirmReset = row; return; }
    confirmReset = -1;
    if (r.part === 'pictures') { deleteAllPictures(); return; }
    save(Logic.resetPart(s, r.part, TILES));
    note = r.label + ' back to defaults';
  }

  function deleteAllPictures() {
    var names = Pictures.all().map(function (p) { return p.name; }), total = names.length;
    busy = true;
    note = 'Deleting pictures…';
    (function next() {
      if (!names.length) { busy = false; save(Logic.setOption(s, 'pictureTimes', {})); note = 'Deleted ' + total + (total === 1 ? ' picture' : ' pictures'); render(); return; }
      var name = names.shift();
      Pictures.remove(name, next, function (msg) {
        busy = false;
        note = 'Couldn\'t delete ' + name + ': ' + msg;
        render();
      });
    })();
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
    } else if (sec === PICTURES) {
      pressPicture();
    } else if (OPTIONS[sec]) {
      var d = OPTIONS[sec][row];
      if (d.type === 'toggle') step(d, 1);
      else pick = Logic.choiceIndex(d.key, s[d.key], s);
    } else {
      pressReset();
    }
  }

  function key(k) {
    var isBack = BACK.indexOf(k) !== -1;
    var dir = k === 38 ? -1 : k === 40 ? 1 : 0;
    note = '';
    if (k !== 13) confirmRemove = confirmReset = -1;
    if (level === 0) {
      if (isBack) { close(); return; }
      if (dir) sec = Logic.moveFocus(sec, dir, SECTIONS.length);
      else if (k === 39 || k === 13) enter();
    } else if (menu !== -1) {
      if (dir) menu = Logic.moveFocus(menu, dir, menuActions().length);
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
    } else if (sec === PICTURES && usb && (isBack || k === 37)) {
      usb = null; // back from the stick to My pictures
      row = 0;
    } else if (isBack || k === 37) {
      level = 0;
    } else if (dir) {
      if (rowCount()) row = Logic.moveFocus(row, dir, rowCount());
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
        (open ? actionMenu(tileActions(t)) : '');
    }).join('');
  }

  // Open menus and dropdowns list their choices as indented rows right under the row they belong to.
  // Picture menus tick the times of day the picture shows at.
  function actionMenu(actions) {
    return '<div class="s-choices">' + actions.map(function (a, i) {
      return '<div class="srow' + (i === menu ? ' focused' : '') + (a.id === 'remove' ? ' danger' : '') + '">' +
        '<span class="s-name">' + a.label + '</span>' +
        ('on' in a ? '<span class="s-tick">' + (a.on ? Icons.check : '') + '</span>' : '') + '</div>';
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

  function picturesPanel() {
    if (usb === 'loading') return '<div class="s-msg">Looking for pictures on the USB stick…</div>';
    return pictureRows().map(function (p, i) {
      var open = rowFocused(i) && menu !== -1;
      var cls = 'srow' + (open ? ' open' : rowFocused(i) ? ' focused' : '');
      if (!p) {
        return '<div class="' + cls + '"><span class="s-logo">' + Icons.usb + '</span>' +
          '<span class="s-name">Import from USB stick</span></div>';
      }
      var value = usb ? (Pictures.has(p.name) ? 'Imported' : 'Import') : Logic.timesLabel(Logic.pictureTimes(s, p.name));
      return '<div class="' + cls + '">' +
        (usb ? '' : '<span class="s-logo"><img src="' + Logic.escapeHtml(p.url) + '"></span>') +
        '<span class="s-name">' + Logic.escapeHtml(p.name) +
        (usb && p.folder ? '<span class="s-folder">' + Logic.escapeHtml(p.folder) + '</span>' : '') + '</span>' +
        '<span class="s-value">' + value + '</span></div>' +
        (open ? actionMenu(pictureActions(p)) : '');
    }).join('') + (!usb && !Pictures.all().length ? '<div class="s-msg">No pictures yet. Put some on a USB stick, plug it into the TV and import them here</div>' : '');
  }

  function optionsPanel() {
    return OPTIONS[sec].map(function (d, i) {
      var open = rowFocused(i) && pick !== -1;
      var value = d.type === 'toggle' ? (s[d.key] ? 'On' : 'Off') : choiceLabel(d.key, s);
      return '<div class="srow' + (open ? ' open' : rowFocused(i) ? ' focused' : '') + '"><span class="s-name">' + d.label + '</span>' +
        '<span class="s-pick"><span class="s-value">' + value + '</span>' +
        (d.type === 'toggle' ? '' : '<span class="s-chevron">' + Icons.chevron + '</span>') + '</span></div>' +
        (open ? dropdown(d.key) : '');
    }).join('');
  }

  function choiceLabel(key, from) { return Logic.choices(key, from)[Logic.choiceIndex(key, from[key], from)].label; }

  function dropdown(key) {
    return '<div class="s-choices">' + Logic.choices(key, s).map(function (c, i) {
      var current = c.value === s[key];
      return '<div class="srow' + (i === pick ? ' focused' : '') + '"><span class="s-name">' + c.label + '</span>' +
        '<span class="s-tick">' + (current ? Icons.check : '') + '</span></div>';
    }).join('') + '</div>';
  }

  function resetValue(r, i) {
    if (confirmReset === i) return r.part === 'pictures' ? 'Press OK again to delete' : 'Press OK again to reset';
    if (r.part === 'pictures') {
      var n = Pictures.all().length;
      return n ? 'Delete ' + n + (n === 1 ? ' picture' : ' pictures') : 'None imported';
    }
    if (isReset(r)) return 'Already default';
    var d = Logic.normalizeSettings(null, TILES);
    if (r.part === 'tiles') return 'Default tiles and order, added apps removed';
    if (r.part === 'display') return 'Ambient ' + choiceLabel('ambientMin', d) + ' · weather ' + (d.weather ? 'on' : 'off') + ' · ' + choiceLabel('background', d);
    if (r.part === 'location') return d.city + ', ' + d.country + ' · city time zone';
    return 'Tiles, display and location';
  }

  function resetPanel() {
    return RESETS.map(function (r, i) {
      return '<div class="srow s-reset' + (r.part === 'all' ? ' s-all' : '') + (isReset(r) ? ' off' : '') + (rowFocused(i) ? ' focused' : '') +
        (confirmReset === i ? ' danger' : '') + '"><span class="s-logo">' + Icons.sections[r.icon] + '</span>' +
        '<span class="s-name">' + r.label + '</span><span class="s-value">' + resetValue(r, i) + '</span></div>';
    }).join('');
  }

  function hint() {
    if (level === 0) return 'Up / Down · section    OK · open    Back · close';
    if (sec === PICTURES && menu !== -1) return 'Up / Down · choose    OK · on / off    Back · close';
    if (menu !== -1 || pick !== -1) return 'Up / Down · choose    OK · select    Back · cancel';
    if (carrying) return 'Up / Down · move    OK · drop';
    if (sec === 1 && (!apps || appsError || !appRows().length)) return 'Back · sections';
    if (sec === 0) return 'OK · options    Back · sections';
    if (sec === 1) return 'OK · add    Back · sections';
    if (sec === PICTURES && usb === 'loading') return 'Back · cancel';
    if (sec === PICTURES && usb) return 'OK · import    Back · My pictures';
    if (sec === PICTURES) return row ? 'OK · times of day, remove    Back · sections' : 'OK · import    Back · sections';
    if (OPTIONS[sec]) return 'Left / Right · change    OK · list    Back · sections';
    return 'OK · reset    Back · sections';
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
    $('s-panel').innerHTML = [tilesPanel, appsPanel, optionsPanel, picturesPanel, optionsPanel, resetPanel][sec]();
    $('s-hint').textContent = note || hint();
    keepInView($('s-panel'));
  }

  return { load: load, get: get, open: open, isOpen: isOpen, key: key };
})();
