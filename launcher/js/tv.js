var TV = (function () {
  'use strict';
  var hasTizen = typeof tizen !== 'undefined';

  function launchApp(appId, onError) {
    if (!hasTizen) { console.log('launch', appId); return; }
    tizen.application.launch(appId, null, function (e) { onError(e.message); });
  }

  function showInput(n, onShown, onError) {
    if (!hasTizen) { console.log('input', n); onShown(); return; }
    tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (s) {
      var all = s.connected.concat(s.disconnected || []);
      var src = all.filter(function (x) { return x.type === 'HDMI' && x.number === n; })[0];
      if (!src) { onError('HDMI ' + n + ' not found'); return; }
      tizen.tvwindow.setSource(src, function () {
        tizen.tvwindow.show(onShown, function (e) { onError(e.message); },
          ['0px', '0px', '1920px', '1080px'], 'MAIN');
      }, function (e) { onError(e.message); }, 'MAIN');
    }, function (e) { onError(e.message); });
  }

  function hideInput() {
    if (!hasTizen) return;
    try { tizen.tvwindow.hide(function () {}, function () {}, 'MAIN'); } catch (e) { /* not shown */ }
  }

  return { launchApp: launchApp, showInput: showInput, hideInput: hideInput };
})();
