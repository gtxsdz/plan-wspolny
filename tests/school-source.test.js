// ============================================================================
//  tests/school-source.test.js
//  Testy logiki, ktora zamienia dane eDzienniczka na wezel `school` w RTDB.
//  Uruchamiane w CI: npm test (bez bazy, bez sieci).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_5A, CLASS_4TA } from '../config.js';
import {
  normSubject,
  resolvePlanSubject,
  examKod,
  resolveExamLesson,
  buildSchoolPayload
} from '../lib/school-source.js';

test('normSubject: male litery, spacje i kropka na koncu', () => {
  assert.equal(normSubject('  Język   Angielski. '), 'język angielski');
  assert.equal(normSubject('WF'), 'wf');
  assert.equal(normSubject(null), '');
});

test('resolvePlanSubject: aliasy obu klas i nazwy nieznane', () => {
  assert.equal(resolvePlanSubject('Język angielski', CLASS_5A), 'j. ang');
  assert.equal(resolvePlanSubject('j. angielski', CLASS_5A), 'j. ang');
  assert.equal(resolvePlanSubject('Zajęcia z wychowawcą', CLASS_5A), 'zaj. z wych.');
  assert.equal(resolvePlanSubject('Wychowanie fizyczne', CLASS_5A), 'wf');

  assert.equal(resolvePlanSubject('prace w obiektach architektury krajobrazu', CLASS_4TA), 'prace w ob. arch.');
  assert.equal(resolvePlanSubject('obiekty małej architektury krajobrazu', CLASS_4TA), 'ob. małej arch.');
  assert.equal(resolvePlanSubject('projekty obiektów architektury krajobrazu', CLASS_4TA), 'proj. ob. arch.');
  assert.equal(resolvePlanSubject('język angielski w architekturze krajobrazu', CLASS_4TA), 'j. ang. w arch.');
  assert.equal(resolvePlanSubject('Język polski', CLASS_4TA), 'j. polski');

  assert.equal(resolvePlanSubject('Edukacja dla bezpieczeństwa', CLASS_5A), '');
  assert.equal(resolvePlanSubject('', CLASS_5A), '');
});

test('examKod czyta Subject.Kod z raw, takze uszkodzonego', () => {
  assert.equal(examKod('{"Subject":{"Kod":"j. polski"}}'), 'j. polski');
  assert.equal(examKod({ Subject: { Kod: 'matematyka' } }), 'matematyka');
  assert.equal(examKod('{nie-json'), '');
  assert.equal(examKod(null), '');
});

test('resolveExamLesson: plan dnia z dziennika ma pierwszenstwo', () => {
  const planRows = [
    { date: '2026-12-02', lesson_no: 2, subject: 'Fizyka' },
    { date: '2026-12-02', lesson_no: 8, subject: 'Matematyka' },
    { date: '2026-12-02', lesson_no: 3, subject: 'obiekty małej architektury krajobrazu' }
  ];
  assert.equal(
    resolveExamLesson({ date: '2026-12-02', subject: 'Fizyka', kod: 'fizyka' }, CLASS_4TA, planRows),
    2
  );
  assert.equal(
    resolveExamLesson({ date: '2026-12-02', subject: 'Matematyka', kod: 'matematyka' }, CLASS_4TA, planRows),
    8
  );
});

test('resolveExamLesson: bez planu dnia szuka w planie tygodniowym', () => {
  // 4Ta, sroda: biologia jest na 8. lekcji (indeks 7, licznik od 1)
  assert.equal(
    resolveExamLesson({ date: '2026-12-09', subject: 'Język polski', kod: 'j. polski' }, CLASS_4TA, []),
    1
  );
  assert.equal(
    resolveExamLesson({ date: '2026-12-10', subject: 'Biologia', kod: 'biologia' }, CLASS_4TA, []),
    2
  );
  // 5a, poniedzialek: WF jest na 5. lekcji
  assert.equal(
    resolveExamLesson({ date: '2026-12-07', subject: 'Wychowanie fizyczne', kod: 'wf' }, CLASS_5A, []),
    5
  );
  assert.equal(
    resolveExamLesson({ date: '2026-12-09', subject: 'Edukacja dla bezpieczeństwa', kod: '' }, CLASS_5A, []),
    0
  );
});

test('buildSchoolPayload: okno od dzisiaj, przypisanie lekcji, zmiany i fallback opisu', () => {
  const exams = [
    { id: '1', date: '2026-11-27', subject: 'Matematyka', type: 'Kartkówka', content: 'dzisiaj', raw: '{"Subject":{"Kod":"matematyka"}}' },
    { id: '2', date: '2026-11-30', subject: 'Wychowanie fizyczne', type: 'Sprawdzian', content: 'koszykówka', teacher: 'E. Szczepańska', raw: '{"Subject":{"Kod":"wf"}}' },
    { id: '3', date: '2027-01-15', subject: 'Matematyka', type: 'Sprawdzian', raw: '{"Subject":{"Kod":"matematyka"}}' },
    { id: '4', date: '2026-12-01', subject: 'Nieznany przedmiot', type: 'Kartkówka', raw: '{"Subject":{"Kod":"nieznany"}}' }
  ];
  const changes = [
    { id: 'ch1', date: '2026-11-30', lesson_no: 5, subject: 'Wychowanie fizyczne', opis: 'zastępstwo: A → B', efekt: 'Zastępstwo', sub_nauczyciel: 'Tomasz Sośnicki' },
    { id: 'ch2', date: '2026-11-30', lesson_no: 99, subject: 'Wychowanie fizyczne', opis: 'poza planem' },
    { id: 'ch3', date: '2026-11-30', lesson_no: 2, subject: 'Język polski', opis: '', efekt: 'Uczniowie zwolnieni do domu' }
  ];
  const { payload, warnings, counts } = buildSchoolPayload({
    cfg: CLASS_5A,
    account: 'katarzyna',
    todayIso: '2026-11-27',
    horizonDays: 21,
    exams,
    changes,
    planRows: [{ date: '2026-11-30', lesson_no: 5, subject: 'Wychowanie fizyczne' }],
    now: 1764500000000
  });

  assert.equal(payload.window.from, '2026-11-27');
  assert.equal(payload.window.to, '2026-12-18');
  assert.equal(payload.source, 'katarzyna');
  assert.equal(payload.updatedAt, 1764500000000);
  assert.deepEqual(counts, { exams: 2, changes: 2 });

  assert.equal(payload.exams['1'].lesson, 1, 'dzisiejszy wpis zostaje - aplikacja ukryje go po lekcji');
  assert.equal(payload.exams['1'].subject, 'Matematyka');
  assert.equal(payload.exams['3'], undefined, 'wpis poza oknem jest odsiany');
  assert.equal(payload.exams['4'], undefined, 'przedmiot bez lekcji w planie jest pominiety');
  assert.equal(payload.exams['2'].lesson, 5);
  assert.equal(payload.exams['2'].teacher, 'E. Szczepańska');

  assert.equal(payload.changes['ch1'].lesson, 5);
  assert.equal(payload.changes['ch1'].subTeacher, 'Tomasz Sośnicki');
  assert.equal(payload.changes['ch2'], undefined, 'lekcja poza slotami jest pomijana');
  assert.equal(payload.changes['ch3'].opis, 'Uczniowie zwolnieni do domu');
  assert.match(warnings.join(' '), /Nieznany przedmiot/);
});

test('buildSchoolPayload: smieci i brak danych nie wywracaja budowy', () => {
  const { payload, counts } = buildSchoolPayload({
    cfg: CLASS_5A, account: 'katarzyna', todayIso: '2026-11-27',
    exams: [null, 'x', { id: 'a', date: 'zla', subject: 'Matematyka' }],
    changes: null,
    planRows: null
  });
  assert.deepEqual(counts, { exams: 0, changes: 0 });
  assert.deepEqual(payload.exams, {});
  assert.deepEqual(payload.changes, {});
});

test('buildSchoolPayload: dluga nazwa 4Ta dopasowuje lekcje, choc do planu idzie skrocona', () => {
  // 42 znaki - wiecej niz LIMITS.SUBJECT (40); wczesniej skrocenie rozbijalo
  // dopasowanie do aliasu i sprawdzian wypadal z planu
  const long = 'prace w obiektach architektury krajobrazu';
  const { payload } = buildSchoolPayload({
    cfg: CLASS_4TA,
    account: 'wiktoria',
    todayIso: '2026-11-27',
    horizonDays: 21,
    exams: [{ id: 'd1', date: '2026-12-01', subject: long, type: 'Sprawdzian' }],
    changes: [],
    planRows: [{ date: '2026-12-01', lesson_no: 3, subject: long }],
    now: 1
  });
  assert.equal(payload.exams.d1?.lesson, 3, 'lekcja znaleziona po pelnej nazwie');
  assert.equal(payload.exams.d1.subject, long.slice(0, 40), 'w planie zostaje nazwa w limicie');
});
