// ============================================================================
//  tests/plan-utils.test.js
//  Testy jednostkowe czystych funkcji z lib/plan-utils.js.
//  Uruchamiane w CI: npm test   (node --test)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc,
  cleanText,
  clampBytes,
  normalizeLesson,
  mergeDays,
  dayTimeRange,
  subjectOptionsFor,
  activeBadge,
  nextBadge,
  saveErrorMessage,
  authErrorMessage,
  LIMITS,
  FALLBACK_ICON,
  DEFAULT_ROOM
} from '../lib/plan-utils.js';

// --- Fixtury zgodne z config.js -------------------------------------------------
const SUBJECT_MAP = { matematyka: '🔬', wf: '🏃' };

const TIMES = [
  { num: '1', time: '8.00–8.45', dTime: '8:00–8:45', s: 480, e: 525 },
  { num: '2', time: '8.55–9.40', dTime: '8:55–9:40', s: 535, e: 580 },
  { num: '3', time: '9.50–10.35', dTime: '9:50–10:35', s: 590, e: 635 }
];

const DAY_META = [
  { dayNum: 1, mobileClass: 'day-pon', colClass: 'col-pon', name: 'Poniedziałek', shortName: 'Pon' },
  { dayNum: 2, mobileClass: 'day-wt', colClass: 'col-wt', name: 'Wtorek', shortName: 'Wt' }
];

test('esc escapuje znaki niebezpieczne dla HTML i atrybutow', () => {
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc("O'Neil & Synowie"), 'O&#39;Neil &amp; Synowie');
  assert.equal(esc('a"b'), 'a&quot;b');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  // polskie znaki i emoji zostaja bez zmian
  assert.equal(esc('ćwiczenia 🏃'), 'ćwiczenia 🏃');
});

test('cleanText normalizuje biale znaki, obcina i odrzuca nie-teksty', () => {
  assert.equal(cleanText('  Jan   Kowalski \n'), 'Jan Kowalski');
  assert.equal(cleanText('a\u0000b\u001Fc'), 'a b c');
  assert.equal(cleanText('abcdef', 3), 'abc');
  assert.equal(cleanText('x'.repeat(100), 10).length, 10);
  assert.equal(cleanText(123), '');
  assert.equal(cleanText(null), '');
  assert.equal(cleanText(undefined), '');
});

test('normalizeLesson odrzuca puste i uszkodzone lekcje', () => {
  assert.deepEqual(normalizeLesson(null, SUBJECT_MAP), { empty: true });
  assert.deepEqual(normalizeLesson(undefined, SUBJECT_MAP), { empty: true });
  assert.deepEqual(normalizeLesson({ empty: true }, SUBJECT_MAP), { empty: true });
  assert.deepEqual(normalizeLesson({ name: '   ' }, SUBJECT_MAP), { empty: true });
  assert.deepEqual(normalizeLesson({ name: 42 }, SUBJECT_MAP), { empty: true });
  assert.deepEqual(normalizeLesson(['wf'], SUBJECT_MAP), { empty: true });
});

test('normalizeLesson dobiera ikone z mapy przedmiotow i domyslna sale', () => {
  assert.deepEqual(normalizeLesson({ name: 'matematyka' }, SUBJECT_MAP), {
    icon: '🔬', name: 'matematyka', room: DEFAULT_ROOM
  });
  assert.deepEqual(normalizeLesson({ name: '  Plastyka ', room: ' 101 ' }, SUBJECT_MAP), {
    icon: FALLBACK_ICON, name: 'Plastyka', room: '101'
  });
  // ikona zapisana w bazie ma pierwszenstwo nad mapa
  assert.deepEqual(normalizeLesson({ name: 'wf', icon: '⚽', room: 'sala' }, SUBJECT_MAP), {
    icon: '⚽', name: 'wf', room: 'sala'
  });
});

test('normalizeLesson obcina pola do limitow z database.rules.json', () => {
  const long = normalizeLesson(
    { name: 'n'.repeat(80), room: 'r'.repeat(50), icon: 'i'.repeat(20) },
    SUBJECT_MAP
  );
  assert.equal(long.name.length, LIMITS.NAME);
  assert.equal(long.room.length, LIMITS.ROOM);
  assert.equal(long.icon.length, LIMITS.ICON);
});

test('clampBytes obcina po bajtach UTF-8 i nie rozrywa znakow', () => {
  assert.equal(clampBytes('abcdef', 10), 'abcdef');
  assert.equal(clampBytes('abcdef', 3), 'abc');
  assert.equal(clampBytes('żżż', 3), 'ż', 'polskie znaki sa dwubajtowe');
  assert.equal(clampBytes('🏛️', 4), '🏛', 'emoji zostaje cale albo wcale');
  assert.equal(clampBytes('🏛️', 8), '🏛️');
  assert.equal(clampBytes('', 5), '');
  assert.equal(clampBytes(null, 5), '');
  assert.equal(clampBytes('abc', 0), '');
});

test('normalizeLesson respektuje limit liczony w bajtach (zgodnie z regułami bazy)', () => {
  const lesson = normalizeLesson({ name: 'ż'.repeat(40), room: 'ą'.repeat(30), icon: '🏛️' }, SUBJECT_MAP);
  assert.ok(Buffer.byteLength(lesson.name, 'utf8') <= LIMITS.NAME);
  assert.ok(Buffer.byteLength(lesson.room, 'utf8') <= LIMITS.ROOM);
  assert.ok(Buffer.byteLength(lesson.icon, 'utf8') <= LIMITS.ICON);
  assert.equal(lesson.icon, '🏛️');
});

test('mergeDays bez danych z bazy zwraca plan domyslny (i nie modyfikuje zrodla)', () => {
  const defaults = [
    [{ icon: '🔬', name: 'matematyka', room: '243' }, { empty: true }, { empty: true }]
  ];
  const { days, warnings } = mergeDays(DAY_META, defaults, null, TIMES, SUBJECT_MAP);

  assert.equal(days.length, DAY_META.length);
  assert.equal(days[0].lessons.length, TIMES.length);
  assert.deepEqual(days[0].lessons[0], { icon: '🔬', name: 'matematyka', room: '243' });
  assert.equal(days[0].lessons[1].empty, true);
  assert.equal(days[1].lessons[0].empty, true, 'brak planu domyslnego dla wtorku -> puste sloty');
  assert.deepEqual(warnings, []);
  assert.equal(days[0].dayNum, 1);

  days[0].lessons[0].room = 'zmiana';
  assert.equal(defaults[0][0].room, '243', 'plan domyslny nie moze byc modyfikowany');
});

test('mergeDays scala dane z bazy slot po slocie', () => {
  const defaults = [[{ icon: '🔬', name: 'matematyka', room: '243' }, { empty: true }, { empty: true }]];
  const fb = [{ lessons: [{ name: 'wf', room: 's.g.', icon: '🏃' }] }];

  const { days } = mergeDays(DAY_META, defaults, fb, TIMES, SUBJECT_MAP);

  assert.deepEqual(days[0].lessons[0], { icon: '🏃', name: 'wf', room: 's.g.' });
  assert.equal(days[0].lessons[1].empty, true, 'pusty slot z bazy zostaje pusty');
  assert.equal(days[0].lessons[2].empty, true, 'brakujacy slot uzupelnia plan domyslny');
});

test('mergeDays ignoruje nadmiarowe sloty i zwraca ostrzezenie', () => {
  const fb = [{ lessons: Array.from({ length: TIMES.length + 2 }, () => ({ name: 'wf', room: '1' })) }];
  const { days, warnings } = mergeDays(DAY_META, [], fb, TIMES, SUBJECT_MAP);

  assert.equal(days[0].lessons.length, TIMES.length);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Poniedziałek/);
  assert.match(warnings[0], /nadmiar zignorowany/);
});

test('mergeDays przyjmuje dni zapisane jako obiekt z kluczami numerycznymi', () => {
  const fb = {
    0: { lessons: [{ name: 'wf', room: '1' }] },
    1: { lessons: [{ name: 'matematyka', room: '2' }] }
  };
  const { days } = mergeDays(DAY_META, [], fb, TIMES, SUBJECT_MAP);

  assert.equal(days[0].lessons[0].name, 'wf');
  assert.equal(days[1].lessons[0].name, 'matematyka');
});

test('mergeDays nie wywraca sie na smieciowych danych', () => {
  const { days } = mergeDays(DAY_META, null, 'nie-tablica', TIMES, SUBJECT_MAP);
  assert.equal(days.length, DAY_META.length);
  assert.ok(days.every((d) => d.lessons.length === TIMES.length));
  assert.equal(days[0].lessons[0].empty, true);
});

test('dayTimeRange liczy zakres od pierwszej do ostatniej lekcji', () => {
  assert.equal(dayTimeRange([{ empty: true }, { name: 'a' }, { name: 'b' }], TIMES), '8:55–10:35');
  assert.equal(dayTimeRange([{ name: 'a' }, { empty: true }, { empty: true }], TIMES), '8:00–8:45');
  assert.equal(dayTimeRange([{ empty: true }, { empty: true }, { empty: true }], TIMES), '');
  assert.equal(dayTimeRange([], TIMES), '');
  assert.equal(dayTimeRange(null, TIMES), '');
  assert.equal(dayTimeRange([{ name: 'a' }], []), '');
  assert.equal(dayTimeRange([{ name: 'a' }], [null]), '');
});

test('subjectOptionsFor zachowuje wartosc spoza listy (koniec cichej utraty danych)', () => {
  assert.deepEqual(subjectOptionsFor(['matematyka', 'wf'], 'chemia'), ['matematyka', 'wf', 'chemia']);
  assert.deepEqual(subjectOptionsFor(['matematyka', 'wf'], 'MATEMATYKA'), ['matematyka', 'wf']);
  assert.deepEqual(subjectOptionsFor(['matematyka'], '   '), ['matematyka']);
  assert.deepEqual(subjectOptionsFor(['matematyka'], ''), ['matematyka']);
  assert.deepEqual(subjectOptionsFor(null, 'chemia'), ['chemia']);
  assert.deepEqual(subjectOptionsFor(undefined, null), []);
});

test('etykiety lekcji i komunikaty bledow', () => {
  assert.equal(activeBadge(12), '🔴 TERAZ (12 min)');
  assert.equal(nextBadge(5), '⏳ za 5 min');

  assert.match(saveErrorMessage('PERMISSION_DENIED'), /uprawnien/);
  assert.match(saveErrorMessage('NOT_AUTHENTICATED'), /Zaloguj/);
  assert.match(saveErrorMessage('NETWORK_ERROR'), /polaczenia/);
  assert.match(saveErrorMessage('UNAVAILABLE'), /polaczenia/);
  assert.match(saveErrorMessage('cokolwiek-innego'), /Blad zapisu/);

  assert.match(authErrorMessage('auth/invalid-email'), /e-mail/);
  assert.match(authErrorMessage('auth/invalid-credential'), /Bledny e-mail/);
  assert.match(authErrorMessage('auth/too-many-requests'), /Zbyt wiele/);
  assert.match(authErrorMessage('auth/operation-not-allowed'), /wylaczone/);
  assert.match(authErrorMessage('nieznany-kod'), /Nie udalo sie/);
});

