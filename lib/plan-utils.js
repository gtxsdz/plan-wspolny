// ============================================================================
//  lib/plan-utils.js
//  Czyste funkcje pomocnicze (bez DOM i bez Firebase) - uzywane przez app.js
//  oraz testowane w tests/plan-utils.test.js.
// ============================================================================

// Limity dlugosci pol lekcji. MUSZA byc zgodne z .validate w database.rules.json
export const LIMITS = Object.freeze({ NAME: 40, ROOM: 24, ICON: 8 });
// Maksymalna liczba slotow lekcji w ciagu dnia (zgodnie z regulami bazy)
export const SLOT_MAX = 12;
export const EMPTY_ICON = '🚫';
export const FALLBACK_ICON = '📖';
export const DEFAULT_ROOM = '—';
// Separator zakresu godzin w config.js (dTime: '8:00–8:45')
const RANGE_SEP = '–';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapuje tekst przed wstawieniem do HTML/atrybutu (ochrona przed XSS).
 * Wszystkie dane pochodzace z bazy/uzytkownika musza przejsc przez esc().
 */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Usuwa znaki sterujace, sprowadza biale znaki do pojedynczej spacji i obcina
 * do `max` znakow. Zwraca '' dla wartosci nie-tekstowych.
 */
export function cleanText(value, max = 60) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const TEXT_ENCODER = new TextEncoder();

/**
 * Obcina tekst do `maxBytes` bajtow UTF-8, nie rozrywajac znakow (emoji
 * wielobajtowe zostaja cale albo wcale). Reguly bazy waliduja dlugosc pol,
 * wiec klient musi ciac identycznie jak one.
 */
export function clampBytes(value, maxBytes) {
  const text = String(value ?? '');
  if (TEXT_ENCODER.encode(text).length <= maxBytes) return text;
  let out = '';
  for (const char of text) {
    if (TEXT_ENCODER.encode(out + char).length > maxBytes) break;
    out += char;
  }
  return out;
}

/**
 * Zamienia surowa wartosc (z bazy albo z formularza) na kanoniczna lekcje.
 * Zwraca { empty: true } albo { icon, name, room }.
 */
export function normalizeLesson(raw, subjectMap = {}, fallbackIcon = FALLBACK_ICON) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.empty === true) {
    return { empty: true };
  }
  const name = clampBytes(cleanText(raw.name, LIMITS.NAME), LIMITS.NAME);
  if (!name) return { empty: true };

  const room = clampBytes(cleanText(raw.room, LIMITS.ROOM), LIMITS.ROOM) || DEFAULT_ROOM;
  const fromData = clampBytes(cleanText(raw.icon, LIMITS.ICON), LIMITS.ICON);
  const fromMap = clampBytes(String(subjectMap[name.toLowerCase()] || ''), LIMITS.ICON);
  const icon = fromData || fromMap || fallbackIcon;
  return { icon, name, room };
}

/** Zamienia obiekt z kluczami numerycznymi (np. z RTDB) na tablice dni. */
function toDayArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
  }
  return null;
}

/**
 * Scala dane z bazy z planem domyslnym (per slot; brakujace sloty uzupelnia
 * plan domyslny) i normalizuje ksztalt kazdej lekcji.
 * Zwraca { days, warnings }.
 */
export function mergeDays(dayMeta, defaults, fbDays, times, subjectMap = {}) {
  const slotCount = Array.isArray(times) ? times.length : 0;
  const dbDays = toDayArray(fbDays);
  const warnings = [];

  const days = (Array.isArray(dayMeta) ? dayMeta : []).map((meta, i) => {
    const dbLessons = Array.isArray(dbDays?.[i]?.lessons) ? dbDays[i].lessons : null;
    const defLessons = Array.isArray(defaults?.[i]) ? defaults[i] : [];

    if (dbLessons && dbLessons.length > slotCount) {
      warnings.push(
        `${meta.name}: w bazie jest wiecej lekcji (${dbLessons.length}) niz slotow (${slotCount}) - nadmiar zignorowany`
      );
    }

    const lessons = [];
    for (let li = 0; li < slotCount; li++) {
      const fromDb = dbLessons ? dbLessons[li] : undefined;
      const raw = fromDb === undefined || fromDb === null ? defLessons[li] : fromDb;
      lessons.push(normalizeLesson(raw, subjectMap));
    }
    return { ...meta, lessons };
  });

  return { days, warnings };
}

/**
 * Zakres godzinowy dnia (od startu pierwszej do konca ostatniej lekcji),
 * np. "8:00–13:35"; '' dla dnia bez lekcji.
 */
export function dayTimeRange(lessons, times) {
  if (!Array.isArray(lessons) || !Array.isArray(times)) return '';
  const filled = [];
  lessons.forEach((l, i) => {
    if (l && !l.empty) filled.push(i);
  });
  if (!filled.length) return '';

  const first = times[filled[0]];
  const last = times[filled[filled.length - 1]];
  if (!first || !last) return '';

  const start = String(first.dTime || '').split(RANGE_SEP)[0];
  const end = String(last.dTime || '').split(RANGE_SEP)[1];
  if (!start || !end) return '';
  return `${start}${RANGE_SEP}${end}`;
}

/**
 * Opcje selecta w edytorze. Jesli biezaca nazwa przedmiotu nie jest na liscie
 * (np. starszy wpis w bazie), dopisujemy ja na koncu, zeby zapis nie zamienil
 * przedmiotu na placeholder.
 */
export function subjectOptionsFor(options, currentName) {
  const list = Array.isArray(options) ? [...options] : [];
  const name = cleanText(currentName, LIMITS.NAME);
  if (!name) return list;
  const exists = list.some((opt) => String(opt).toLowerCase() === name.toLowerCase());
  return exists ? list : [...list, name];
}

/** Etykieta lekcji odbywajacej sie teraz. */
export function activeBadge(minsLeft) {
  return `🔴 TERAZ (${minsLeft} min)`;
}

/** Etykieta najblizszej lekcji w przerwie. */
export function nextBadge(minsLeft) {
  return `⏳ za ${minsLeft} min`;
}

/** Czytelny komunikat bledu zapisu na podstawie kodu bledu Firebase. */
export function saveErrorMessage(code) {
  switch (code) {
    case 'NOT_AUTHENTICATED':
      return '⚠️ Sesja wygasla. Zaloguj sie ponownie.';
    case 'PERMISSION_DENIED':
      return '⚠️ Brak uprawnien do zapisu tego planu.';
    case 'NETWORK_ERROR':
    case 'UNAVAILABLE':
      return '⚠️ Brak polaczenia z baza. Sprobuj ponownie.';
    default:
      return '⚠️ Blad zapisu!';
  }
}

/** Czytelny komunikat bledu logowania na podstawie kodu bledu Firebase Auth. */
export function authErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'Nieprawidlowy adres e-mail.';
    case 'auth/missing-password':
      return 'Podaj haslo.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Bledny e-mail lub haslo.';
    case 'auth/too-many-requests':
      return 'Zbyt wiele prob logowania. Sprobuj pozniej.';
    case 'auth/network-request-failed':
      return 'Brak polaczenia z serwerem logowania.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Logowanie e-mail/haslo jest wylaczone w konfiguracji projektu.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Nieprawidlowy klucz API projektu (sprawdz ograniczenia klucza).';
    default:
      return 'Nie udalo sie zalogowac. Sprobuj ponownie.';
  }
}

