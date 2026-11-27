// ============================================================================
//  tests/update-check.test.js
//  Wykrywanie starej kopii aplikacji w przegladarce: porownanie wersji,
//  ograniczenie czestotliwosci sprawdzen i adres przeladowania.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_INTERVAL_MS,
  LOAD_SLACK_MS,
  parseVersion,
  isStale,
  isBuildAfter,
  needsReload,
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

const LOADED_AT = Date.parse('2026-11-27T12:00:00Z');
const remote = (sha, built = '2026-11-27T11:00:00Z') => ({ sha, built });
const reloadArgs = (over = {}) => ({ seen: null, remote: remote('bbb'), loadedAt: LOADED_AT, reloadedFor: null, ...over });

test('needsReload: znana wersja rozna od serwerowej wymaga przeladowania', () => {
  assert.equal(needsReload(reloadArgs({ seen: 'aaa' })), true);
  assert.equal(needsReload(reloadArgs({ seen: 'bbb' })), false);
});

test('needsReload: karta bez znanej wersji porownuje czas wdrozenia z wczytaniem', () => {
  // wdrozenie 20 min po wczytaniu strony - karta na pewno jest stara
  assert.equal(needsReload(reloadArgs({ remote: remote('bbb', '2026-11-27T12:20:00Z') })), true);
  // wdrozenie tuz przed wczytaniem - to ta sama wersja
  assert.equal(needsReload(reloadArgs({ remote: remote('bbb', '2026-11-27T11:59:00Z') })), false);
  // w granicach zapasu na zegar telefonu nie przeladowujemy
  assert.equal(needsReload(reloadArgs({ remote: remote('bbb', '2026-11-27T12:05:00Z') })), false);
});

test('needsReload: blokada petli, brak danych i smieci', () => {
  assert.equal(needsReload(reloadArgs({ seen: 'aaa', reloadedFor: 'bbb' })), false, 'druga proba tej samej wersji');
  assert.equal(needsReload(reloadArgs({ seen: 'aaa', reloadedFor: 'ccc' })), true);
  assert.equal(needsReload(), false);
  assert.equal(needsReload({ seen: 'aaa', remote: null, loadedAt: LOADED_AT }), false);
  assert.equal(needsReload({ seen: 'aaa', remote: { built: 'x' }, loadedAt: LOADED_AT }), false);
  assert.equal(needsReload(reloadArgs({ remote: remote('bbb', 'nie-data') })), false);
  assert.equal(needsReload(reloadArgs({ loadedAt: Number.NaN })), false);
});

test('isBuildAfter: zapas na zegar i odpornosc na brak daty', () => {
  assert.equal(LOAD_SLACK_MS, 10 * 60 * 1000, 'zapas ma chronic przed zegarem telefonu');
  assert.equal(isBuildAfter({ built: '2026-11-27T12:30:00Z' }, LOADED_AT), true);
  assert.equal(isBuildAfter({ built: '2026-11-27T12:05:00Z' }, LOADED_AT), false);
  assert.equal(isBuildAfter({ built: '2026-11-27T12:05:00Z' }, LOADED_AT, 0), true);
  assert.equal(isBuildAfter({ built: '' }, LOADED_AT), false);
  assert.equal(isBuildAfter({}, LOADED_AT), false);
  assert.equal(isBuildAfter({ built: '2026-11-27T12:30:00Z' }, null), false);
});

