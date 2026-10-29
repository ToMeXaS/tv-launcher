var Icons = (function () {
  'use strict';
  var Y = '#FFC83D', W = '#EEF2F7', B = '#7CC4FF';
  function svg(body) { return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + body + '</svg>'; }
  var sunBody = '<circle cx="32" cy="32" r="11" fill="' + Y + '"/><g stroke="' + Y + '" stroke-width="4" stroke-linecap="round">' +
    '<path d="M32 6v7M32 51v7M6 32h7M51 32h7M13.6 13.6l5 5M45.4 45.4l5 5M13.6 50.4l5-5M45.4 18.6l5-5"/></g>';
  var cloudBody = '<path d="M19 50h28a11 11 0 0 0 0-22 15 15 0 0 0-29-3A12.5 12.5 0 0 0 19 50z" fill="' + W + '"/>';
  var smallCloud = '<path d="M24 54h24a9 9 0 0 0 0-18 12 12 0 0 0-23-2A10 10 0 0 0 24 54z" fill="' + W + '"/>';
  var moonBody = '<path d="M38 8a24 24 0 1 0 18 38A20 20 0 0 1 38 8z" fill="#E6E3F2"/>';
  var raisedCloud = '<g transform="translate(0 -8)">' + cloudBody + '</g>';

  var weather = {
    sun: svg(sunBody),
    moon: svg(moonBody),
    cloud: svg(cloudBody),
    partly: svg('<g transform="translate(-8 -8) scale(.8)">' + sunBody + '</g>' + smallCloud),
    'partly-night': svg('<g transform="translate(-6 -8) scale(.75)">' + moonBody + '</g>' + smallCloud),
    fog: svg('<g stroke="' + W + '" stroke-width="5" stroke-linecap="round"><path d="M10 22h44M6 34h52M12 46h40"/></g>'),
    rain: svg(raisedCloud + '<g stroke="' + B + '" stroke-width="4" stroke-linecap="round"><path d="M22 50l-3 8M33 50l-3 8M44 50l-3 8"/></g>'),
    snow: svg(raisedCloud + '<g fill="' + W + '"><circle cx="21" cy="54" r="3"/><circle cx="32" cy="58" r="3"/><circle cx="43" cy="54" r="3"/></g>'),
    thunder: svg(raisedCloud + '<path d="M34 44l-8 12h7l-3 8 10-13h-7l4-7z" fill="' + Y + '"/>')
  };

  var sunsetIcon = svg('<path d="M14 44a18 18 0 0 1 36 0z" fill="' + Y + '"/><path d="M6 50h52" stroke="' + Y +
    '" stroke-width="4" stroke-linecap="round"/><path d="M32 8v14M25 15l7-7 7 7" stroke="' + Y +
    '" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');

  var app = {
    hdmi: '<svg viewBox="0 0 80 48" xmlns="http://www.w3.org/2000/svg"><path d="M6 8h68v18l-9 13H15L6 26z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><rect x="19" y="18" width="42" height="8" rx="2" fill="#fff"/></svg>',
    netflix: '<svg viewBox="0 0 40 64" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h11l18 44V0h11v64H29L11 20v44H0z" fill="#E50914"/></svg>',
    stremio: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><rect x="14" y="14" width="36" height="36" rx="7" transform="rotate(45 32 32)" fill="#8A5AFF"/><path d="M27 22l15 10-15 10z" fill="#fff"/></svg>',
    twitch: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M14 4L8 14v40h14v8h8l8-8h10l12-12V4z" fill="#fff"/><path d="M18 9h37v29l-8 8H35l-8 8v-8h-9z" fill="#9146FF"/><path d="M28 18h5v14h-5zM41 18h5v14h-5z" fill="#fff"/></svg>',
    moonlight: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M36 6a26 26 0 1 0 22 40A21 21 0 0 1 36 6z" fill="#EEF2F7"/><circle cx="48" cy="14" r="3" fill="#7CC4FF"/><circle cx="56" cy="26" r="2" fill="#7CC4FF"/></svg>',
    youtube: '<svg viewBox="0 0 90 64" xmlns="http://www.w3.org/2000/svg"><rect y="4" width="90" height="56" rx="16" fill="#FF0000"/><path d="M36 20l23 12-23 12z" fill="#fff"/></svg>'
  };

  return { weather: weather, sun: sunsetIcon, app: app };
})();
