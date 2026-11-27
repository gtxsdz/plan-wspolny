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
    // Realtime Database zwraca obiekt z kluczami "0".."4" takze wtedy, gdy
    // zapisany jest tylko jeden dzien (np. sam piatek po zapisie z edytora).
    // Klucz MUSI zostac indeksem dnia - zebranie wartosci po kolei przesuneloby
    // piatek na poniedzialek.
    const keys = Object.keys(value).filter((k) => /^\d+$/.test(k));
    if (!keys.length) return null;
    const out = [];
    keys.forEach((k) => { out[Number(k)] = value[k]; });
    return out;
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
 * Czy w planie jest choc jedna prawdziwa lekcja. Sluzy do odsiania pustego
 * albo uszkodzonego cache - taki plan nie moze zaslonic planu wbudowanego
 * w aplikacje (inaczej strona zostaje bez lekcji).
 */
export function hasAnyLesson(days) {
  if (!Array.isArray(days)) return false;
  return days.some(
    (day) => Array.isArray(day?.lessons) && day.lessons.some((l) => l && !l.empty)
  );
}

/**
/**
 * Odcisk jednego dnia (nazwy i sale lekcji) - do porownania, co administrator
 * faktycznie zmienil w edytorze. Pusta lekcja to `null`, wiec "brak lekcji"
 * i "lekcja pusta" daja ten sam odcisk.
 */
export function daySignature(day) {
  const lessons = Array.isArray(day?.lessons) ? day.lessons : [];
  return JSON.stringify(
    lessons.map((l) => (l && !l.empty ? [String(l.name ?? ''), String(l.room ?? '')] : null))
  );
}

/**
 * Numery dni rozniacych sie od stanu przy otwarciu edytora. Zapisujemy tylko te
 * dni, zeby nie nadpisac zmian wprowadzonych w miedzyczasie przez kogos innego.
 */
export function changedDays(baseline, next) {
  const count = Math.max(Array.isArray(baseline) ? baseline.length : 0, Array.isArray(next) ? next.length : 0);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (daySignature(baseline?.[i]) !== daySignature(next?.[i])) out.push(i);
  }
  return out;
}

/**
 * Dni zmienione w bazie od otwarcia edytora, ktore ten administrator tez
 * edytuje: jego zapis nadpisze cudza wersje i warto go o tym uprzedzic.
 */
export function conflictDays(baseline, current, changed) {
  const own = new Set(Array.isArray(changed) ? changed : []);
  const list = Array.isArray(current) ? current : [];
  return list
    .map((_, i) => i)
    .filter((i) => own.has(i) && daySignature(baseline?.[i]) !== daySignature(list[i]));
}

/**
 * Ktore sloty dnia pokazac na telefonie: lekcje niepuste oraz puste sloty,
 * na ktorych dziennik ma sprawdzian albo zmiane planu (na desktopie znacznik
 * widac na pustym kafelku, wiec telefon nie moze go pominac).
 */
export function mobileSlotIndexes(day, overlayDay) {
  const lessons = Array.isArray(day?.lessons) ? day.lessons : [];
  const slots = Array.isArray(overlayDay?.slots) ? overlayDay.slots : [];
  const out = [];
  lessons.forEach((l, i) => {
    if ((l && !l.empty) || slots[i]) out.push(i);
  });
  return out;
}

/**
 * Koniec dnia z uwzglednieniem dzisiejszych wpisow z dziennika (sprawdzian,
 * zmiana planu na lekcji, ktorej nie ma w planie tygodniowym - np. siodma
 * godzina dopisana w dzienniku). Bez tego kolumna dnia przeskoczylaby na
 * nastepny tydzien przed ta lekcja i wpis zniknalby z ekranu.
 */
export function journalDayEndMins(raw, todayIso, times) {
  if (!Array.isArray(times) || !todayIso) return 0;
  let last = -1;
  ['exams', 'changes'].forEach((kind) => {
    const entries = raw && typeof raw[kind] === 'object' ? raw[kind] : null;
    if (!entries) return;
    Object.values(entries).forEach((entry) => {
      if (!entry || entry.date !== todayIso) return;
      const lesson = Number(entry.lesson);
      if (!Number.isInteger(lesson) || lesson < 1 || lesson > times.length) return;
      last = Math.max(last, lesson - 1);
    });
  });
  return last >= 0 ? Number(times[last]?.e) || 0 : 0;
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

// ============================================================================
//  NAKLADKA Z DZIENNIKA (sprawdziany, kartkowki, zmiany w planie)
//  Daty liczone sa w ISO (RRRR-MM-DD) i UTC - bez wplywu stref/DST na numer dnia.
// ============================================================================

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Indeks = JS getUTCDay() (0 = niedziela)
const DAY_NAMES = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const DAY_MS = 86400000;

/** Minuty od 1970-01-01 UTC dla daty ISO; NaN dla zlego formatu. */
function isoToUtc(iso) {
  const m = DATE_RE.exec(String(iso ?? ''));
  if (!m) return NaN;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  // Odrzuca 31.02 i podobne daty, ktore Date.UTC przesuwa na kolejny miesiac.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return ms;
}

function utcToIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Data ISO przesunieta o `days` dni ('' dla zlej daty). */
export function addISODays(iso, days) {
  const ms = isoToUtc(iso);
  if (!Number.isFinite(ms)) return '';
  return utcToIso(ms + Math.trunc(days) * DAY_MS);
}

/** Numer dnia tygodnia ISO: 1 = poniedzialek ... 7 = niedziela, 0 = zla data. */
export function isoWeekday(iso) {
  const ms = isoToUtc(iso);
  if (!Number.isFinite(ms)) return 0;
  const wd = new Date(ms).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Dzisiejsza data w Polsce (RRRR-MM-DD), niezaleznie od strefy urzadzenia. */
export function warsawToday(now = new Date()) {
  const parts = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).forEach((p) => { parts[p.type] = p.value; });
  if (!parts.year || !parts.month || !parts.day) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Krotka data do naglowka kolumny: 2026-12-02 -> "2.12". */
export function shortDate(iso) {
  const m = DATE_RE.exec(String(iso ?? ''));
  if (!m) return '';
  return `${Number(m[3])}.${Number(m[2])}`;
}

/** Dzien tygodnia z data: 2026-12-02 -> "środa, 2.12". */
export function longDate(iso) {
  const ms = isoToUtc(iso);
  if (!Number.isFinite(ms)) return '';
  return `${DAY_NAMES[new Date(ms).getUTCDay()]}, ${shortDate(iso)}`;
}

/** "dziś" / "jutro" / "za N dni" wzgledem podanej daty. */
export function relativeDay(iso, todayIso) {
  const a = isoToUtc(iso);
  const b = isoToUtc(todayIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  const diff = Math.round((a - b) / DAY_MS);
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'jutro';
  if (diff > 1) return `za ${diff} dni`;
  return 'minęło';
}

/**
 * Najbliższa data o podanym dniu tygodnia (1 = poniedziałek), licząc od
 * `fromIso` włącznie. Dzięki temu każda kolumna planu pokazuje swoje najbliższe
 * wystąpienie: minione dni przechodzą na następny tydzień, a dzisiejszy dzień
 * zostaje, dopóki trwają lekcje.
 */
export function nextDateForWeekday(fromIso, weekday) {
  const fromWd = isoWeekday(fromIso);
  const target = Number(weekday);
  if (!fromWd || !Number.isInteger(target) || target < 1 || target > 7) return '';
  return addISODays(fromIso, (target - fromWd + 7) % 7);
}

/** Znacznik sprawdzianu: sprawdzian/praca klasowa vs kartkowka vs inne. */
export function examMarker(type) {
  const t = String(type ?? '').toLowerCase();
  if (t.includes('sprawdzian') || t.includes('klasow')) return '📝';
  if (t.includes('kartk')) return '✏️';
  return '📌';
}

// Limity pol nakladki (dane pochodza z dziennika; przycinamy przed renderem)
const OVERLAY_LIMITS = Object.freeze({
  ID: 40, SUBJECT: 40, TYPE: 30, CONTENT: 500, TEACHER: 60,
  OPIS: 240, EFFECT: 60, ROOM: 24, TIME: 24
});

function overlayList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function overlayText(value, max) {
  return clampBytes(cleanText(value, max), max);
}

/**
 * Buduje nakladke na tygodniowy plan: dla kazdego dnia (kolumny) i slotu
 * liste sprawdzianow oraz zmiany planu.
 *
 * Wejscie: surowe `school` z RTDB ({ exams, changes }), dzisiejsza data ISO,
 * sloty (config.times) i metadane dni. Opcjonalnie `nowMins` (minuty od
 * polnocy) i `dayEndMins` (koniec ostatniej lekcji) - wtedy dzisiejszy dzien
 * zostaje w planie do konca zajec, a wpisy z lekcji, ktore juz sie odbyly,
 * sa pomijane. Zwraca:
 * { monday, from, to, days: [{ ...meta, iso, short, slots: [{exams, changes}|null] }],
 *   count: { exams, changes }, updatedAt, source }
 */
export function buildSchoolOverlay(raw, options = {}) {
  const todayIso = DATE_RE.test(String(options.todayIso ?? '')) ? options.todayIso : '';
  const times = Array.isArray(options.times) ? options.times : [];
  const dayMeta = Array.isArray(options.dayMeta) ? options.dayMeta : [];
  const nowMins = Number.isFinite(options.nowMins) ? options.nowMins : null;
  const dayEndMins = Number.isFinite(options.dayEndMins) ? options.dayEndMins : 0;

  const tomorrow = todayIso ? addISODays(todayIso, 1) : '';
  const todayWeekday = isoWeekday(todayIso);
  // Dzisiejszy dzien zostaje w planie, dopoki lekcje trwaja (lub przed nimi).
  const todayVisible = Boolean(
    todayIso && todayWeekday >= 1 && todayWeekday <= dayMeta.length &&
    nowMins !== null && nowMins <= dayEndMins
  );
  const fromIso = todayVisible ? todayIso : tomorrow;

  const days = dayMeta.map((meta, i) => {
    const dayNum = Number(meta.dayNum) || i + 1;
    const iso = fromIso ? nextDateForWeekday(fromIso, dayNum) : '';
    return {
      ...meta,
      iso,
      short: iso ? shortDate(iso) : '',
      slots: times.map(() => null)
    };
  });

  // Kolumny moga nie byc w kolejnosci dat (minione dni -> nastepny tydzien).
  const monday = days[0]?.iso || '';
  const firstIso = days.reduce((min, d) => (!min || (d.iso && d.iso < min) ? d.iso : min), '');
  const lastIso = days.reduce((max, d) => (d.iso > max ? d.iso : max), '');

  const inWindow = (iso) => Boolean(
    DATE_RE.test(String(iso ?? '')) && fromIso && lastIso && iso >= fromIso && iso <= lastIso
  );

  // Wpisy z dzisiejszych lekcji, ktore juz sie skonczyly, nie sa pokazywane.
  const lessonAlreadyEnded = (iso, lesson) => {
    if (!todayVisible || iso !== todayIso) return false;
    const end = Number(times[lesson - 1]?.e);
    return Number.isFinite(end) && nowMins >= end;
  };

  const count = { exams: 0, changes: 0 };

  const place = (iso, lesson, key, value) => {
    const dayIndex = isoWeekday(iso) - 1;
    const day = days[dayIndex];
    if (!day) return false;
    const slotIndex = lesson - 1;
    if (slotIndex < 0 || slotIndex >= times.length) return false;
    const slot = day.slots[slotIndex] || { exams: [], changes: [] };
    slot[key].push(value);
    day.slots[slotIndex] = slot;
    count[key] += 1;
    return true;
  };

  overlayList(raw?.exams).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const date = String(item.date ?? '');
    if (!inWindow(date)) return;
    const subject = overlayText(item.subject, OVERLAY_LIMITS.SUBJECT);
    if (!subject) return;
    const lesson = Number(item.lesson);
    if (!Number.isInteger(lesson) || lesson < 1) return;
    if (lessonAlreadyEnded(date, lesson)) return;
    const type = overlayText(item.type, OVERLAY_LIMITS.TYPE);
    const exam = {
      id: overlayText(item.id, OVERLAY_LIMITS.ID) || `${date}|${subject}|${type}`,
      date,
      lesson,
      subject,
      type,
      content: overlayText(item.content, OVERLAY_LIMITS.CONTENT),
      teacher: overlayText(item.teacher, OVERLAY_LIMITS.TEACHER)
    };
    place(date, lesson, 'exams', exam);
  });

  overlayList(raw?.changes).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const date = String(item.date ?? '');
    if (!inWindow(date)) return;
    const lesson = Number(item.lesson);
    if (!Number.isInteger(lesson) || lesson < 1) return;
    if (lessonAlreadyEnded(date, lesson)) return;
    const subject = overlayText(item.subject, OVERLAY_LIMITS.SUBJECT);
    if (!subject) return;
    const effect = overlayText(item.effect, OVERLAY_LIMITS.EFFECT);
    let opis = overlayText(item.opis, OVERLAY_LIMITS.OPIS);
    if (!opis) {
      opis = [effect, overlayText(item.subSubject, OVERLAY_LIMITS.SUBJECT),
        overlayText(item.subTeacher, OVERLAY_LIMITS.TEACHER),
        overlayText(item.subRoom, OVERLAY_LIMITS.ROOM)].filter(Boolean).join(' · ') || 'zmiana w planie';
    }
    const change = {
      id: overlayText(item.id, OVERLAY_LIMITS.ID) || `${date}|${lesson}|${subject}`,
      date,
      lesson,
      subject,
      effect,
      opis,
      subSubject: overlayText(item.subSubject, OVERLAY_LIMITS.SUBJECT),
      subTeacher: overlayText(item.subTeacher, OVERLAY_LIMITS.TEACHER),
      subRoom: overlayText(item.subRoom, OVERLAY_LIMITS.ROOM),
      newLesson: Number.isInteger(Number(item.newLesson)) && Number(item.newLesson) > 0 ? Number(item.newLesson) : 0,
      time: overlayText(item.time, OVERLAY_LIMITS.TIME)
    };
    place(date, lesson, 'changes', change);
  });

  days.forEach((day) => {
    day.slots.forEach((slot) => {
      if (slot) slot.exams.sort((a, b) => a.date.localeCompare(b.date));
    });
  });

  const updatedAt = Number(raw?.updatedAt);
  return {
    monday,
    from: firstIso && lastIso ? firstIso : '',
    to: lastIso,
    days,
    count,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
    source: overlayText(raw?.source, 20)
  };
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

