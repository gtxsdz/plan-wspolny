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
  hasAnyLesson,
  dayTimeRange,
  subjectOptionsFor,
  activeBadge,
  nextBadge,
  saveErrorMessage,
  authErrorMessage,
  addISODays,
  isoWeekday,
  shortDate,
  longDate,
  relativeDay,
  displayWeekMonday,
  examMarker,
  buildSchoolOverlay,
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

test('hasAnyLesson odsiewa pusty i uszkodzony plan (cache nie moze zaslonic planu)', () => {
  assert.equal(hasAnyLesson([{ lessons: [{ name: 'wf', room: '1' }] }]), true);
  assert.equal(hasAnyLesson([{ lessons: [{ empty: true }, { empty: true }] }]), false);
  assert.equal(hasAnyLesson([{ lessons: [] }]), false);
  assert.equal(hasAnyLesson([{}]), false);
  assert.equal(hasAnyLesson([]), false);
  assert.equal(hasAnyLesson(null), false);
  assert.equal(hasAnyLesson('nie-tablica'), false);
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


// --- Nakladka z dziennika: daty, sprawdziany, zmiany planu ------------------

test('daty ISO: przesuniecia, dzien tygodnia i formaty', () => {
  assert.equal(addISODays('2026-11-27', 3), '2026-11-30');
  assert.equal(addISODays('2026-12-31', 1), '2027-01-01');
  assert.equal(addISODays('2028-02-28', 1), '2028-02-29', 'rok przestepny');
  assert.equal(addISODays('2026-11-27', -1), '2026-11-26');
  assert.equal(addISODays('zla-data', 1), '');
  assert.equal(addISODays('', 1), '');

  assert.equal(isoWeekday('2026-11-30'), 1);
  assert.equal(isoWeekday('2026-12-04'), 5);
  assert.equal(isoWeekday('2026-11-29'), 7);
  assert.equal(isoWeekday('2026-11-27'), 5);
  assert.equal(isoWeekday('2026-13-01'), 0, 'niepoprawny miesiac nie liczy sie jako data');

  assert.equal(shortDate('2026-12-02'), '2.12');
  assert.equal(shortDate('2026-01-09'), '9.1');
  assert.equal(shortDate(''), '');
  assert.equal(longDate('2026-12-02'), 'środa, 2.12');
  assert.equal(longDate('2026-11-30'), 'poniedziałek, 30.11');
  assert.equal(relativeDay('2026-11-27', '2026-11-27'), 'dziś');
  assert.equal(relativeDay('2026-11-28', '2026-11-27'), 'jutro');
  assert.equal(relativeDay('2026-12-02', '2026-11-27'), 'za 5 dni');
  assert.equal(relativeDay('2026-11-26', '2026-11-27'), 'minęło');
  assert.equal(relativeDay('', '2026-11-27'), '');
});

test('wyswietlany tydzien: biezacy od poniedzialku, w piatek nastepny po lekcjach', () => {
  assert.equal(displayWeekMonday('2026-11-23'), '2026-11-23', 'poniedzialek');
  assert.equal(displayWeekMonday('2026-11-26'), '2026-11-23', 'czwartek');
  assert.equal(displayWeekMonday('2026-11-27'), '2026-11-30', 'piatek bez zegara = po lekcjach');
  assert.equal(displayWeekMonday('2026-11-28'), '2026-11-30', 'sobota');
  assert.equal(displayWeekMonday('2026-11-29'), '2026-11-30', 'niedziela');
  assert.equal(displayWeekMonday(''), '');

  // W piatek rano (przed koncem lekcji) zostaje biezacy tydzien.
  assert.equal(
    displayWeekMonday('2026-11-27', { nowMins: 600, dayEndMins: 635 }),
    '2026-11-23',
    'piatek w trakcie lekcji'
  );
  assert.equal(
    displayWeekMonday('2026-11-27', { nowMins: 636, dayEndMins: 635 }),
    '2026-11-30',
    'piatek po ostatniej lekcji'
  );
});

test('buildSchoolOverlay: w piatek rano zostaje dzisiejszy dzien', () => {
  const raw = {
    exams: [
      { id: 'a', date: '2026-11-27', lesson: 1, subject: 'Matematyka', type: 'Kartkówka' },
      { id: 'b', date: '2026-11-27', lesson: 3, subject: 'Matematyka', type: 'Sprawdzian' },
      { id: 'c', date: '2026-11-30', lesson: 1, subject: 'Biologia', type: 'Sprawdzian' }
    ]
  };
  const DAYS = [
    { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
    { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
  ];
  // Piątek 27.11, 9:00: lekcja 1 (do 8:45) już się odbyła, lekcja 3 (do 10:35) jeszcze nie.
  const morning = buildSchoolOverlay(raw, {
    todayIso: '2026-11-27', nowMins: 540, dayEndMins: 635, times: TIMES, dayMeta: DAYS
  });
  assert.equal(morning.monday, '2026-11-23');
  assert.equal(morning.from, '2026-11-27');
  assert.equal(morning.count.exams, 1, 'zostaje tylko sprawdzian z lekcji, ktora sie nie skonczyla');
  assert.equal(morning.days[4].slots[2].exams[0].id, 'b');
  assert.equal(morning.days[4].slots[0], null, 'kartkówka z 8:45 już się odbyła');

  // Po ostatniej lekcji (10:36) plan przechodzi na następny tydzień.
  const after = buildSchoolOverlay(raw, {
    todayIso: '2026-11-27', nowMins: 636, dayEndMins: 635, times: TIMES, dayMeta: DAYS
  });
  assert.equal(after.monday, '2026-11-30');
  assert.equal(after.from, '2026-11-28');
  assert.equal(after.count.exams, 1);
  assert.equal(after.days[0].slots[0].exams[0].id, 'c');
});

test('buildSchoolOverlay: w tygodniu dzisiejszy wpis znika po swojej lekcji', () => {
  const raw = { exams: [{ id: 'dzis', date: '2026-12-02', lesson: 2, subject: 'Fizyka', type: 'Kartkówka' }] };
  const DAYS = [
    { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
    { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
  ];
  const during = buildSchoolOverlay(raw, {
    todayIso: '2026-12-02', nowMins: 550, dayEndMins: 635, times: TIMES, dayMeta: DAYS
  });
  assert.equal(during.from, '2026-12-02');
  assert.equal(during.days[2].slots[1].exams[0].id, 'dzis');

  const afterLesson = buildSchoolOverlay(raw, {
    todayIso: '2026-12-02', nowMins: 580, dayEndMins: 635, times: TIMES, dayMeta: DAYS
  });
  assert.equal(afterLesson.count.exams, 0, 'po dzwonku wpis znika');
});

test('znacznik sprawdzianu zaleznie od typu', () => {
  assert.equal(examMarker('Sprawdzian'), '📝');
  assert.equal(examMarker('Praca klasowa'), '📝');
  assert.equal(examMarker('Kartkówka'), '✏️');
  assert.equal(examMarker('Odpowiedź ustna'), '📌');
  assert.equal(examMarker(null), '📌');
});

test('buildSchoolOverlay: tylko od jutra, przypisanie do dnia i lekcji', () => {
  // Sroda 2.12.2026 -> wyswietlany tydzien 30.11-4.12
  const raw = {
    updatedAt: 1764500000000,
    exams: {
      a: { id: 'a', date: '2026-12-03', lesson: 2, subject: 'Fizyka', type: 'Kartkówka', content: 'FALE' },
      b: { id: 'b', date: '2026-12-01', lesson: 1, subject: 'Matematyka', type: 'Sprawdzian' },
      c: { id: 'c', date: '2026-12-07', lesson: 1, subject: 'Biologia', type: 'Sprawdzian' },
      d: { id: 'd', date: '2026-12-05', lesson: 1, subject: 'Biologia', type: 'Sprawdzian' }
    },
    changes: [
      { id: 'ch1', date: '2026-12-03', lesson: 3, subject: 'Język polski', opis: 'zastępstwo: A → B' },
      { id: 'ch2', date: '2026-12-04', lesson: 99, subject: 'Język polski', opis: 'poza planem' }
    ]
  };
  const DAYS = [
    { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
    { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
  ];
  const overlay = buildSchoolOverlay(raw, { todayIso: '2026-12-02', times: TIMES, dayMeta: DAYS });

  assert.equal(overlay.monday, '2026-11-30');
  assert.equal(overlay.from, '2026-12-03');
  assert.equal(overlay.to, '2026-12-04');
  assert.deepEqual(overlay.days.map((d) => d.short), ['30.11', '1.12', '2.12', '3.12', '4.12']);
  assert.equal(overlay.count.exams, 1, 'sprawdzian z 1.12 (przeszlosc) i spoza tygodnia odsiane');
  assert.equal(overlay.count.changes, 1);

  const wed = overlay.days[2];
  assert.equal(wed.slots[1], null, 'sprawdzian z dzisiaj nie jest pokazywany');

  const thu = overlay.days[3];
  assert.equal(thu.slots[1].exams[0].subject, 'Fizyka');
  assert.equal(thu.slots[1].exams[0].content, 'FALE');
  assert.equal(thu.slots[2].changes[0].opis, 'zastępstwo: A → B');
  assert.equal(overlay.updatedAt, 1764500000000);
});

test('buildSchoolOverlay: w piatek pokazuje przyszly tydzien i czyści przeszlosc', () => {
  const raw = {
    exams: [
      { id: 'a', date: '2026-11-27', lesson: 1, subject: 'Matematyka', type: 'Kartkówka' },
      { id: 'b', date: '2026-11-30', lesson: 1, subject: 'Matematyka', type: 'Sprawdzian' },
      { id: 'c', date: '2026-12-04', lesson: 3, subject: 'WF', type: 'Kartkówka' }
    ]
  };
  const DAYS = [
    { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
    { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
  ];
  const overlay = buildSchoolOverlay(raw, { todayIso: '2026-11-27', times: TIMES, dayMeta: DAYS });

  assert.equal(overlay.monday, '2026-11-30');
  assert.equal(overlay.from, '2026-11-28');
  assert.equal(overlay.count.exams, 2);
  assert.equal(overlay.days[0].slots[0].exams[0].date, '2026-11-30');
  assert.equal(overlay.days[4].slots[2].exams[0].subject, 'WF');
});

test('buildSchoolOverlay: odporne na smieci i przycina pola', () => {
  const raw = {
    exams: [
      null,
      'nie-obiekt',
      { date: 'zla', lesson: 1, subject: 'Matematyka' },
      { date: '2026-12-03', lesson: 'x', subject: 'Matematyka' },
      { date: '2026-12-03', lesson: 1, subject: '' },
      { date: '2026-12-03', lesson: 1, subject: 'M'.repeat(80), type: 'Sprawdzian', content: 'x'.repeat(900) }
    ],
    changes: 'nie-tablica'
  };
  const DAYS = [
    { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
    { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
  ];
  const overlay = buildSchoolOverlay(raw, { todayIso: '2026-12-02', times: TIMES, dayMeta: DAYS });
  assert.equal(overlay.count.exams, 1);
  const exam = overlay.days[3].slots[0].exams[0];
  assert.equal(exam.subject.length, 40);
  assert.ok(exam.content.length <= 500);
  assert.deepEqual(overlay.count, { exams: 1, changes: 0 });
});

test('buildSchoolOverlay: zmiana bez opisu dostaje czytelne wypelnienie', () => {
  const overlay = buildSchoolOverlay(
    { changes: [{ id: 'z', date: '2026-12-03', lesson: 2, subject: 'WF', effect: 'Zastępstwo', subTeacher: 'Jan Nowak' }] },
    { todayIso: '2026-12-02', times: TIMES, dayMeta: [
      { dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' },
      { dayNum: 3, name: 'Środa' }, { dayNum: 4, name: 'Czwartek' }, { dayNum: 5, name: 'Piątek' }
    ] }
  );
  assert.equal(overlay.days[3].slots[1].changes[0].opis, 'Zastępstwo · Jan Nowak');
});

test('buildSchoolOverlay bez danych nadal zwraca daty tygodnia', () => {
  const overlay = buildSchoolOverlay(null, {
    todayIso: '2026-11-27', times: TIMES,
    dayMeta: [{ dayNum: 1, name: 'Poniedziałek' }, { dayNum: 2, name: 'Wtorek' }]
  });
  assert.deepEqual(overlay.days.map((d) => d.iso), ['2026-11-30', '2026-12-01']);
  assert.deepEqual(overlay.count, { exams: 0, changes: 0 });
  assert.equal(overlay.updatedAt, 0);
});
