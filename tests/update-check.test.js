// ============================================================================
//  tests/update-check.test.js
//  Wykrywanie starej kopii aplikacji w przegladarce: porownanie wersji,
//  ograniczenie czestotliwosci sprawdzen i adres przeladowania.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_INTERVAL_MS,
  parseVersion,
  isStale,
  shouldCheck,
  reloadHref,
  versionLabel
} from '../lib/update-check.js';

test('parseVersion przyjmuje tylko wpis z niepustym skrotem commita', () => {
  const v = parseVersion({ sha: ' abc123 ', app: 'x', css: 'y', built: '2026-11-27T10:00:00Z' });
  assert.deepEqual(v, { sha: 'abc123', app: 'x', css: 'y', built: '2026-11-27T10:00:00Z' });

  assert.equal(parseVersion(null), null);
  assert.equal(parseVersion({}), null);
  assert.equal(parseVersion({ sha: '   ' }), null);
  assert.equal(parseVersion({ sha: 42 }), null);
  assert.deepEqual(parseVersion({ sha: 'abc' }), { sha: 'abc', app: '', css: '', built: '' });
});

test('isStale rozpoznaje nowsza wersje tylko przy dwoch znanych skrotach', () => {
  assert.equal(isStale('aaa', 'bbb'), true);
  assert.equal(isStale('aaa', 'aaa'), false);
  assert.equal(isStale(null, 'bbb'), false, 'pierwsze uruchomienie nie jest "stara wersja"');
  assert.equal(isStale('aaa', ''), false);
  assert.equal(isStale(undefined, undefined), false);
});

test('shouldCheck ogranicza czestotliwosc pytan o wersje', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.equal(shouldCheck(null, now), true);
  assert.equal(shouldCheck('', now), true);
  assert.equal(shouldCheck('nie-data', now), true);
  assert.equal(shouldCheck(new Date(now - 1000).toISOString(), now), false);
  assert.equal(shouldCheck(new Date(now - CHECK_INTERVAL_MS).toISOString(), now), true);
  assert.equal(
    shouldCheck('2026-11-27T12:00:10Z', now),
    true,
    'zegar cofniety - sprawdzamy od razu, a nie po godzinie'
  );
  assert.equal(shouldCheck(null, Number.NaN), false);
});

test('reloadHref dokleja wersje i zachowuje parametry oraz zakotwiczenie', () => {
  assert.equal(
    reloadHref('https://plan5a.web.app/', 'abcdef1234567890'),
    'https://plan5a.web.app/?v=abcdef123456'
  );
  assert.equal(
    reloadHref('https://plan5a.web.app/?klasa=4ta#dzis', 'abcdef1234567890'),
    'https://plan5a.web.app/?klasa=4ta&v=abcdef123456#dzis'
  );
  assert.equal(reloadHref('https://plan5a.web.app/', ''), 'https://plan5a.web.app/');
});

test('versionLabel pokazuje krotki skrot commita, a bez niego date wdrozenia', () => {
  assert.equal(versionLabel({ sha: 'abcdef1234567890', built: '2026-11-27T10:00:00Z' }), 'abcdef1');
  assert.equal(versionLabel({ sha: '', built: '2026-11-27T10:00:00Z' }), '2026-11-27T10:00:00Z');
  assert.equal(versionLabel(null), '');
});
