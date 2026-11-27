// ============================================================================
//  lib/update-check.js
//  Wykrywanie starej kopii aplikacji trzymanej przez przegladarke telefonu.
//
//  Hosting wysyla naglowki "no-cache"/"must-revalidate", ale karta otwarta od
//  kilku dni, skrot na pulpicie albo kopia z cache spod starych naglowkow dalej
//  pokazuje poprzednia wersje. Zamiast liczyc na reczne odswiezanie, aplikacja
//  co jakis czas pyta serwer o wersje (version.json zapisywany przy wdrozeniu)
//  i porownuje ja z ta, ktora uruchomila sie w tej karcie.
//
//  Modul jest czysty (bez DOM i bez fetch w srodku logiki), zeby dalo sie go
//  przetestowac w node --test. Klej do przegladarki jest w app.js.
// ============================================================================

// Klucze sessionStorage: pamiec jest per karta, wiec druga karta nie robi
// falszywych alarmow. localStorage byloby wspolne dla wszystkich kart.
export const SEEN_KEY = 'plan_wersja_widziana';
export const CHECKED_KEY = 'plan_wersja_sprawdzono';
export const RELOADED_KEY = 'plan_wersja_przeladowano';

// Co ile pytamy serwer o wersje, gdy karta jest otwarta na wierzchu.
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// version.json zapisywany przez CI: skrot commita, sumy kontrolne plikow, data.
export function parseVersion(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const sha = typeof payload.sha === 'string' ? payload.sha.trim() : '';
  if (!sha) return null;
  return {
    sha,
    app: typeof payload.app === 'string' ? payload.app : '',
    css: typeof payload.css === 'string' ? payload.css : '',
    built: typeof payload.built === 'string' ? payload.built : ''
  };
}

// Wersja na serwerze rozni sie od tej uruchomionej w karcie.
export function isStale(seenSha, remoteSha) {
  return Boolean(seenSha && remoteSha && seenSha !== remoteSha);
}

// Karta, ktora nie zna swojej wersji (pierwsze sprawdzenie wypadlo, gdy byla
// ukryta albo bez sieci), porownuje czas wdrozenia z momentem wczytania strony.
// Zapas chroni przed zegarem telefonu spieszącym sie o kilka minut.
export const LOAD_SLACK_MS = 10 * 60 * 1000;

export function isBuildAfter(version, loadedAtMs, slackMs = LOAD_SLACK_MS) {
  if (!version || !version.built || !Number.isFinite(loadedAtMs)) return false;
  const built = Date.parse(version.built);
  if (!Number.isFinite(built)) return false;
  return built > loadedAtMs + slackMs;
}

// Czy ta karta powinna przejsc na wersje z serwera.
// seen: wersja, ktora ta karta juz widziala (null = jeszcze nie wiemy),
// reloadedFor: wersja, na ktora ta karta juz sie przeladowywala (blokada petli).
export function needsReload({ seen, remote, loadedAt, reloadedFor, slackMs } = {}) {
  if (!remote || !remote.sha) return false;
  if (reloadedFor === remote.sha) return false;
  if (seen) return seen !== remote.sha;
  return isBuildAfter(remote, loadedAt, slackMs);
}

// Czy wypada juz zapytac serwer (zeby nie strzelac przy kazdym powrocie do karty).
export function shouldCheck(lastCheckIso, now, minIntervalMs = CHECK_INTERVAL_MS) {
  if (!Number.isFinite(now)) return false;
  if (!lastCheckIso) return true;
  const last = Date.parse(lastCheckIso);
  if (!Number.isFinite(last)) return true;
  if (now < last) return true; // zegar cofniety - sprawdzamy od razu
  return now - last >= minIntervalMs;
}

// Adres z parametrem wersji: inny adres = przegladarka nie ma go w cache.
// Zachowuje pozostale parametry (np. ?klasa=5a) oraz zakotwiczenie.
export function reloadHref(href, sha) {
  const url = new URL(href);
  if (sha) url.searchParams.set('v', sha.slice(0, 12));
  return url.toString();
}

// Krotki opis do komunikatu (skrot commita, a bez niego data wdrozenia).
export function versionLabel(version) {
  if (!version) return '';
  if (version.sha) return version.sha.slice(0, 7);
  return version.built || '';
}
