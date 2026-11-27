#!/usr/bin/env node
// ============================================================================
//  tools/write-version.mjs
//  Zapisuje version.json na potrzeby wykrywania starej kopii w przegladarce
//  (lib/update-check.js). Uruchamiane w CI przed publikacja hostingu.
//
//  Plik nie jest trzymany w repo - powstaje przy kazdym wdrozeniu i zawiera
//  skrot commita oraz sumy kontrolne app.js i styles.css.
// ============================================================================

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

function gitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const version = {
  sha: gitSha(),
  app: hash('app.js'),
  css: hash('styles.css'),
  built: new Date().toISOString()
};

writeFileSync('version.json', `${JSON.stringify(version, null, 2)}\n`);
console.log(
  `version.json: ${version.sha.slice(0, 7) || 'brak-sha'} app=${version.app.slice(0, 12)} css=${version.css.slice(0, 12)} (${version.built})`
);
