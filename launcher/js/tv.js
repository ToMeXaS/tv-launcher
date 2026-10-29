var TV = (function () {
  'use strict';
  var hasTizen = typeof tizen !== 'undefined';

  function launchApp(appId, onError) {
    if (!hasTizen) { console.log('launch', appId); return; }
    try {
      tizen.application.launch(appId, null, function (e) { onError(e.message); });
    } catch (e) { onError(e.message || String(e)); }
  }

  function showInput(n, onShown, onError) {
    if (!hasTizen) { console.log('input', n); onShown(); return; }
    function fail(e) { onError((e && e.message) || String(e)); }
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (s) {
        try {
          var all = s.connected.concat(s.disconnected || []);
          var src = all.filter(function (x) { return x.type === 'HDMI' && x.number === n; })[0];
          if (!src) { onError('HDMI ' + n + ' not found'); return; }
          tizen.tvwindow.setSource(src, function () {
            try {
              tizen.tvwindow.show(onShown, fail, ['0px', '0px', '1920px', '1080px'], 'MAIN');
            } catch (e) { fail(e); }
          }, fail, 'MAIN');
        } catch (e) { fail(e); }
      }, fail);
    } catch (e) { fail(e); }
  }

  function hideInput() {
    if (!hasTizen) return;
    try { tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) { /* not shown */ }
  }

  // Digit keys only reach the app once registered.
  function registerNumberKeys() {
    if (!hasTizen) return;
    for (var i = 1; i <= 9; i++) {
      try { tizen.tvinputdevice.registerKey(String(i)); } catch (e) { /* key not on this remote */ }
    }
  }

  return { launchApp: launchApp, showInput: showInput, hideInput: hideInput, registerNumberKeys: registerNumberKeys };
})();
