// ============================================================================
//  tests/deploy-assets.test.js
//  Kontrola kompletnosci wdrozenia: kazdy plik, ktorego uzywa aplikacja, musi
//  istniec i NIE moze byc wykluczony przez "ignore" w firebase.json.
//  Dodatkowo: kazdy target hostingu musi byc zdefiniowany w .firebaserc,
//  a sciezka regul bazy musi istniec.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');

const firebaseJson = JSON.parse(read('firebase.json'));
const firebaserc = JSON.parse(read('.firebaserc'));

const isLocal = (u) => !/^(https?:|data:|mailto:|#)/i.test(u);

const html = read('index.html');
const fromHtml = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter(isLocal);

const app = read('app.js');
const fromApp = [...app.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);

const ASSETS = [...new Set([...fromHtml, ...fromApp])].map((a) => a.replace(/^\.\//, '')).filter((a) => !a.startsWith('?'));

// Uproszczony matcher wzorcow z firebase.json (dokladnie te ksztalty, ktorych uzywamy)
function isIgnored(relPath, patterns) {
  const segments = relPath.split('/');
  const base = segments[segments.length - 1];
  return patterns.some((p) => {
    if (p === relPath) return true;
    if (p === '**/.*') return segments.some((s) => s.startsWith('.'));
    if (p === '**/node_modules/**') return segments.includes('node_modules');
    if (p.endsWith('/**')) {
      const dir = p.slice(0, -3);
      return relPath === dir || relPath.startsWith(`${dir}/`);
    }
    return false;
  });
}

test('kazdy zasob uzywany przez aplikacje istnieje w repo', () => {
  assert.ok(ASSETS.length >= 8, `wykryto tylko ${ASSETS.length} zasobow - sprawdz parser`);
  const missing = ASSETS.filter((a) => !existsSync(path.join(ROOT, a)));
  assert.deepEqual(missing, [], 'brakujace pliki');
});

test('zaden uzywany zasob nie jest wykluczony z publikacji (ignore)', () => {
  const blocks = firebaseJson.hosting;
  assert.ok(Array.isArray(blocks) && blocks.length === 2, 'oczekiwane dwa hostingi (plan5a, plan4ta)');
  for (const block of blocks) {
    const ignored = ASSETS.filter((a) => isIgnored(a, block.ignore || []));
    assert.deepEqual(ignored, [], `hosting ${block.target}: zasoby wykluczone z publikacji`);
  }
});

test('pliki robocze nie trafiaja na hosting', () => {
  const shouldNotBePublished = ['database.rules.json', 'package.json', 'README.md', 'tools/vendor-firebase.mjs', 'tests/plan-rules.test.js'];
  for (const block of firebaseJson.hosting) {
    for (const file of shouldNotBePublished) {
      assert.ok(isIgnored(file, block.ignore || []), `hosting ${block.target}: ${file} powinien byc ignorowany`);
    }
  }
});

test('targety hostingu sa zdefiniowane w .firebaserc, a plik regul istnieje', () => {
  const definedTargets = new Set();
  for (const projectTargets of Object.values(firebaserc.targets || {})) {
    for (const targets of Object.values(projectTargets.hosting || {})) {
      targets.forEach((t) => definedTargets.add(t));
    }
  }
  for (const block of firebaseJson.hosting) {
    assert.ok(definedTargets.has(block.target), `target ${block.target} nie jest zdefiniowany w .firebaserc`);
    assert.ok(firebaserc.projects[block.target], `brak projektu dla targetu ${block.target} w .firebaserc`);
  }

  const rules = firebaseJson.database?.rules;
  assert.equal(rules, 'database.rules.json');
  assert.ok(existsSync(path.join(ROOT, rules)), 'plik regul z firebase.json nie istnieje');
});

test('kazdy hosting ustawia naglowki bezpieczenstwa i cache dla sciezki /', () => {
  for (const block of firebaseJson.hosting) {
    const sources = (block.headers || []).map((h) => h.source);
    assert.ok(sources.includes('**'), `hosting ${block.target}: brak naglowkow dla **`);
    assert.ok(sources.includes('/'), `hosting ${block.target}: brak reguly cache dla "/"`);

    const all = (block.headers || []).flatMap((h) => h.headers || []).map((h) => h.key);
    for (const key of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy']) {
      assert.ok(all.includes(key), `hosting ${block.target}: brak naglowka ${key}`);
    }
  }
});

test('version.json jest publikowany bez cache (wykrywanie starej kopii)', () => {
  for (const block of firebaseJson.hosting) {
    assert.equal(
      isIgnored('version.json', block.ignore || []),
      false,
      `hosting ${block.target}: version.json nie moze byc wykluczony z publikacji`
    );
    const rule = (block.headers || []).find((h) => h.source === '/version.json');
    assert.ok(rule, `hosting ${block.target}: brak reguly naglowkow dla /version.json`);
    const cache = (rule.headers || []).find((h) => h.key === 'Cache-Control');
    assert.equal(cache?.value, 'no-store', `hosting ${block.target}: version.json musi miec Cache-Control no-store`);
  }
});

test('wdrozenie zapisuje version.json przed publikacja hostingu', () => {
  for (const target of ['plan5a', 'plan4ta']) {
    const workflow = read(`.github/workflows/deploy-${target}.yml`);
    const versionAt = workflow.indexOf('tools/write-version.mjs');
    const deployAt = workflow.indexOf('name: Publikacja hostingu');
    assert.ok(versionAt > -1, `workflow ${target}: brak kroku tools/write-version.mjs`);
    assert.ok(deployAt > -1, `workflow ${target}: brak kroku publikacji hostingu`);
    assert.ok(versionAt < deployAt, `workflow ${target}: version.json musi powstac przed publikacja`);
  }
  assert.ok(existsSync(path.join(ROOT, 'tools/write-version.mjs')), 'brak tools/write-version.mjs');
});

