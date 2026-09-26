// ============================================================================
//  tests/config.test.js
//  Spojnosc danych w config.js: wybor klasy, godziny lekcji, limity dlugosci
//  pol zgodne z database.rules.json, przedmioty z listy edytora.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_5A, CLASS_4TA, pickClassId } from '../config.js';
import { LIMITS } from '../lib/plan-utils.js';

const CLASSES = [CLASS_5A, CLASS_4TA];

test('pickClassId wybiera klase po parametrze ?klasa= i po adresie', () => {
  assert.equal(pickClassId('4ta', 'localhost'), '4ta');
  assert.equal(pickClassId('5a', 'plan4ta.web.app'), '5a', 'parametr ma pierwszenstwo nad adresem');
  assert.equal(pickClassId('4TA', 'plan5a.web.app'), '4ta');
  assert.equal(pickClassId('', 'plan4ta.web.app'), '4ta');
  assert.equal(pickClassId(null, 'plan5a.web.app'), '5a');
  assert.equal(pickClassId(undefined, 'localhost'), '5a');
  assert.equal(pickClassId('cokolwiek', 'nieznany.example.org'), '5a');
});

test('godziny lekcji obu klas sa spojne i rosnaco uporzadkowane', () => {
  for (const cfg of CLASSES) {
    assert.equal(cfg.defaultLessons.length, 5, `${cfg.id}: plan musi obejmowac 5 dni roboczych`);
    assert.ok(cfg.times.length >= 6 && cfg.times.length <= 12, `${cfg.id}: liczba slotow poza zakresem 6-12`);

    cfg.times.forEach((slot, i) => {
      assert.ok(slot.s < slot.e, `${cfg.id}: lekcja ${i + 1} - start musi byc przed koncem`);
      assert.ok(slot.dTime.includes('–'), `${cfg.id}: lekcja ${i + 1} - brak zakresu godzin w dTime`);
      if (i > 0) {
        assert.ok(cfg.times[i - 1].e < slot.s, `${cfg.id}: lekcja ${i + 1} zaczyna sie przed koncem poprzedniej`);
      }
    });

    cfg.defaultLessons.forEach((day, di) => {
      assert.equal(day.length, cfg.times.length, `${cfg.id}: dzien ${di + 1} ma inna liczbe lekcji niz godzin`);
    });
  }
});

test('domyslne lekcje i mapy przedmiotow mieszcza sie w limitach regul bazy', () => {
  for (const cfg of CLASSES) {
    for (const lesson of cfg.defaultLessons.flat()) {
      if (!lesson || lesson.empty) continue;
      const bytes = (v) => Buffer.byteLength(String(v), 'utf8');
      assert.ok(bytes(lesson.name) <= LIMITS.NAME, `${cfg.id}: nazwa "${lesson.name}" przekracza ${LIMITS.NAME} znakow`);
      assert.ok(bytes(lesson.room) <= LIMITS.ROOM, `${cfg.id}: sala "${lesson.room}" przekracza ${LIMITS.ROOM} znakow`);
      assert.ok(bytes(lesson.icon) <= LIMITS.ICON, `${cfg.id}: ikona "${lesson.icon}" przekracza ${LIMITS.ICON} znakow`);
    }

    for (const [name, icon] of Object.entries(cfg.subjectMap)) {
      const bytes = (v) => Buffer.byteLength(String(v), 'utf8');
      assert.ok(bytes(icon) <= LIMITS.ICON, `${cfg.id}: ikona mapy dla "${name}" przekracza ${LIMITS.ICON} znakow`);
      assert.ok(bytes(name) <= LIMITS.NAME, `${cfg.id}: nazwa przedmiotu "${name}" przekracza ${LIMITS.NAME} znakow`);
    }
  }
});

test('kazdy domyslny przedmiot jest dostepny na liscie edytora', () => {
  for (const cfg of CLASSES) {
    const options = new Set(cfg.subjectOptions.map((o) => String(o).toLowerCase()));
    const names = [...new Set(cfg.defaultLessons.flat().filter((l) => l && !l.empty).map((l) => l.name))];
    const missing = names.filter((n) => !options.has(n.toLowerCase()));
    assert.deepEqual(missing, [], `${cfg.id}: przedmioty domyslne spoza listy subjectOptions`);
  }
});

test('kazdy przedmiot z listy edytora ma ikone w mapie', () => {
  for (const cfg of CLASSES) {
    for (const opt of cfg.subjectOptions) {
      assert.equal(
        typeof cfg.subjectMap[String(opt).toLowerCase()],
        'string',
        `${cfg.id}: brak ikony w subjectMap dla "${opt}"`
      );
    }
  }
});
