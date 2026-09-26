// ============================================================================
//  boot-fallback.js
//  Zwykly (nie-modulowy) skrypt startowy, ladowany PRZED app.js.
//  Zadania:
//   1. Awaryjnie odslania naglowek i pokazuje komunikat, gdy app.js nie ruszy
//      (blad sieci, brak plikow, wygasly cache przegladarki).
//   2. Udostepnia window.planNotice / planReady / planFail dla app.js.
// ============================================================================
(function () {
  var BOOT_TIMEOUT_MS = 5000;
  var done = false;

  function noticeElement() {
    return document.getElementById('appNotice');
  }

  function planNotice(message, isError) {
    var el = noticeElement();
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    el.classList.toggle('err', !!isError);
  }

  function planReady() {
    done = true;
    window.clearTimeout(timer);
  }

  function planFail(message) {
    window.clearTimeout(timer);
    var header = document.getElementById('pageHeader');
    if (header) header.classList.remove('header-loading');
    var h1 = document.getElementById('classHeading');
    if (h1 && !h1.textContent.trim()) h1.textContent = 'Plan lekcji';
    planNotice(message || 'Nie udalo sie wczytac aplikacji. Odswiez strone (Ctrl+F5).', true);
  }

  window.planNotice = planNotice;
  window.planReady = planReady;
  window.planFail = planFail;

  var timer = window.setTimeout(function () {
    if (done) return;
    var header = document.getElementById('pageHeader');
    if (header && header.classList.contains('header-loading')) {
      planFail('Nie udalo sie wczytac aplikacji (brak plikow lub polaczenia). Odswiez strone.');
    }
  }, BOOT_TIMEOUT_MS);

  // Blad wczytania skryptu lub nieobsluzony blad przed startem app.js
  window.addEventListener(
    'error',
    function (event) {
      if (done) return;
      var target = event && event.target;
      var header = document.getElementById('pageHeader');
      var stillLoading = header && header.classList.contains('header-loading');
      if (target && target.tagName === 'SCRIPT' && stillLoading) {
        planFail('Nie udalo sie wczytac skryptu aplikacji. Odswiez strone.');
      }
    },
    true
  );
})();
