// ============================================================================
//  tests/plan-rules.test.js
//  Testy niezmiennikow bezpieczenstwa pliku database.rules.json.
//  Chronia przed powrotem do otwartego zapisu ("auth != null") i do
//  przechowywania hasla admina w bazie. Uruchamiane w CI: npm test
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS } from '../lib/plan-utils.js';

const raw = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
const rules = JSON.parse(raw).rules;

test('reguly sa poprawnym JSON-em z sekcja rules', () => {
  assert.equal(typeof rules, 'object');
  assert.ok(rules.schedule);
});

test('plan czyta kazdy, ale zapis wymaga wpisu w node admins', () => {
  assert.equal(rules.schedule['.read'], true);
  const write = rules.schedule['.write'];
  assert.equal(typeof write, 'string');
  assert.notEqual(write, 'auth != null', 'zapis nie moze byc dostepny dla kazdego zalogowanego');
  assert.match(write, /auth != null/);
  assert.match(write, /root\.child\('admins'\)\.child\(auth\.uid\)\.exists\(\)/);
});

test('haslo administratora nie jest przechowywane w bazie', () => {
  assert.ok(!raw.includes('adminHash'), 'reguly nie moga odnosic sie do node adminHash');
});

test('lista administratorow nie jest publicznie czytelna', () => {
  const admins = rules.admins;
  assert.equal(admins['.read'], undefined, 'node admins nie moze miec publicznego .read');
  assert.equal(admins['.write'], undefined, 'node admins nie moze byc zapisywalny z klienta');
  assert.equal(admins.$uid['.read'], 'auth != null && auth.uid === $uid');
});

test('zaden node nie ma otwartego zapisu (.write: true)', () => {
  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === '.write') {
        assert.notEqual(value, true, `otwarty zapis w ${path || '/'}`);
      } else if (value && typeof value === 'object') {
        walk(value, `${path}/${key}`);
      }
    }
  };
  walk(rules, '');
});

test('walidacja pol lekcji jest spojna z limitami w lib/plan-utils.js', () => {
  const slot = rules.schedule.days.$day.lessons.$slot;
  assert.match(slot.name['.validate'], new RegExp(`<= ${LIMITS.NAME}(?!\\d)`));
  assert.match(slot.room['.validate'], new RegExp(`<= ${LIMITS.ROOM}(?!\\d)`));
  assert.match(slot.icon['.validate'], new RegExp(`<= ${LIMITS.ICON}(?!\\d)`));
  assert.equal(slot.empty['.validate'], 'newData.isBoolean()');
});
