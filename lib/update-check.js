// ============================================================================
//  lib/update-check.js
//  Wykrywanie starej kopii aplikacji trzymanej przez przegladarke telefonu.
//
//  Hosting wysyla naglowki "no-cache"/"must-revalidate", ale karta otwarta od
//  kilku dni, skrot na pulpicie albo kopia z cache spod starych naglowkow dalej
//  pokazuje poprzednia wersje. Zamiast liczyc na reczne odswiezanie, aplikacja
//  co jakis czas pyta serwer o wersje (version.json zapisywany przy wdrozeniu)
//  i porownuje CZAS wdrozenia z chwila, w ktorej ta karta sie wczytala. To jedyny
//  sygnal, ktory karta zna niezaleznie od tego, co zdazyla zapamietac w pamieci.
//
//  Modul jest czysty (bez DOM i bez fetch w srodku logiki), zeby dalo sie go
//  przetestowac w node --test. Klej do przegladarki jest w app.js.
// ============================================================================

// Klucze sessionStorage: pamiec jest per karta, wiec druga karta nie robi
// falszywych alarmow. localStorage byloby wspolne dla wszystkich kart.
export const CHECKED_KEY = 'plan_wersja_sprawdzono';
export const RELOADED_KEY = 'plan_wersja_przeladowano';

// Co ile pytamy serwer o wersje, gdy karta jest otwarta na wierzchu.
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Zapas miedzy czasem wdrozenia (zegar serwera CI) a chwila wczytania strony
// (zegar telefonu). Chroni przed drobnym rozjechaniem zegarow; wiekszy zapas
// oznaczalby, ze wdrozenie tuz po wczytaniu zostaje niezauwazone.
export const LOAD_SLACK_MS = 60 * 1000;

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

// Czy wersja z serwera powstala PO wczytaniu tej strony (z tolerancja na zegary).
export function isBuildAfter(version, loadedAtMs, slackMs = LOAD_SLACK_MS) {
  if (!version || !version.built || !Number.isFinite(loadedAtMs)) return false;
  const built = Date.parse(version.built);
  if (!Number.isFinite(built)) return false;
  return built > loadedAtMs + slackMs;
}

// Czy ta karta powinna przejsc na wersje z serwera.
// remote: wersja z version.json, loadedAt: chwila wczytania strony,
// reloadedFor: wersja, na ktora ta karta juz sie przeladowywala (blokada petli),
// now: chwila sprawdzenia (domyslnie teraz).
//
// Zapas na zegary dziala TYLKO przez pierwsze LOAD_SLACK_MS od wczytania karty.
// Po tym czasie porownanie jest juz wiarygodne, wiec wdrozenie zrobione tuz po
// wczytaniu karty nie wypada z gry na zawsze - zostanie wykryte przy kolejnym
// sprawdzeniu (co 5 minut).
export function needsReload({ remote, loadedAt, reloadedFor, now, slackMs = LOAD_SLACK_MS } = {}) {
  if (!remote || !remote.sha) return false;
  if (reloadedFor === remote.sha) return false;
  const built = Date.parse(remote?.built);
  if (!Number.isFinite(built) || !Number.isFinite(loadedAt)) return false;
  const at = Number.isFinite(now) ? now : Date.now();
  const trusted = at - loadedAt >= slackMs;
  return trusted ? built > loadedAt : built > loadedAt + slackMs;
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
