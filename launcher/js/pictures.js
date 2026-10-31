var Pictures = (function () {
  'use strict';
  var DIR = 'wgt-private/backgrounds'; // the app's own storage, so pictures stay after the USB stick is unplugged
  var MAX_DEPTH = 3; // folders below the stick's root that are searched
  var MAX_FOUND = 300;
  var SKIP = /^(\.|\$|System Volume Information$)/; // hidden and Windows system folders
  var fs = typeof tizen !== 'undefined' && tizen.filesystem;
  var list = []; // imported pictures, [{ name, url }] sorted by name

  function all() { return list; }

  function has(name) {
    var n = Logic.safeName(name);
    return list.some(function (p) { return p.name === n; });
  }

  function errText(e) { return (e && e.message) || String(e); }

  function picture(name) { return { name: name, url: fs ? fs.toURI(DIR + '/' + name) : name }; }

  // Reads the pictures imported earlier; the browser preview starts with none.
  function load(done) {
    if (!fs) { done(); return; }
    try {
      if (!fs.pathExists(DIR)) { done(); return; }
      fs.listDirectory(DIR, function (names) {
        list = names.filter(Logic.isPicture).map(picture).sort(Logic.byName);
        done();
      }, function () { done(); });
    } catch (e) { done(); }
  }

  function isDir(path) {
    try { return fs.isDirectory(path); } catch (e) { return false; }
  }

  // Pictures on every mounted USB stick, a few folders deep: [{ name, path, folder }], sorted by folder then name.
  function scanUsb(onFound, onError) {
    if (!fs) {
      onFound(['01.jpg', '04.jpg', '07.jpg'].map(function (n) { return { name: 'Holiday ' + n, path: 'bg/' + n, folder: 'DCIM' }; }));
      return;
    }
    try {
      fs.listStorages(function (storages) {
        var roots = storages.filter(function (s) { return s.type === 'EXTERNAL' && s.state === 'MOUNTED'; });
        if (!roots.length) { onError('No USB stick found. Plug one in and try again'); return; }
        var found = [], pending = 0;
        function done() {
          if (--pending) return;
          onFound(found.sort(function (a, b) { return a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : Logic.byName(a, b); }));
        }
        function walk(path, folder, depth) {
          pending++;
          try {
            fs.listDirectory(path, function (names) {
              names.forEach(function (n) {
                var p = path + '/' + n;
                if (SKIP.test(n)) return;
                if (Logic.isPicture(n)) { if (found.length < MAX_FOUND) found.push({ name: n, path: p, folder: folder }); }
                else if (depth < MAX_DEPTH && isDir(p)) walk(p, folder ? folder + '/' + n : n, depth + 1);
              });
              done();
            }, done);
          } catch (e) { done(); }
        }
        roots.forEach(function (s) { walk(s.label, '', 0); });
      }, function (e) { onError(errText(e)); });
    } catch (e) { onError(errText(e)); }
  }

  // Copies a picture found by scanUsb into the app, under a name that is safe in a CSS url().
  function add(p, onDone, onError) {
    var name = Logic.safeName(p.name);
    function added() {
      if (!has(name)) list = list.concat([fs ? picture(name) : { name: name, url: p.path }]).sort(Logic.byName);
      onDone(name);
    }
    if (!fs) { added(); return; }
    function fail(e) { onError(errText(e)); }
    function copy() {
      try { fs.copyFile(p.path, DIR + '/' + name, true, added, fail); } catch (e) { fail(e); }
    }
    try {
      if (fs.pathExists(DIR)) copy(); else fs.createDirectory(DIR, true, copy, fail);
    } catch (e) { fail(e); }
  }

  function remove(name, onDone, onError) {
    function removed() {
      list = list.filter(function (p) { return p.name !== name; });
      onDone();
    }
    if (!fs) { removed(); return; }
    try { fs.deleteFile(DIR + '/' + name, removed, function (e) { onError(errText(e)); }); } catch (e) { onError(errText(e)); }
  }

  return { load: load, all: all, has: has, scanUsb: scanUsb, add: add, remove: remove };
})();
