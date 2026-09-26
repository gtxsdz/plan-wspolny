// ============================================================================
//  check-syntax.mjs
//  Kontrola skladni plikow JS bez dodatkowych zaleznosci (wbudowany
//  "node --check"). Uruchamiane w CI: npm run check
// ============================================================================

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '.firebase']);

function collect(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.m?js$/.test(entry)) out.push(full);
  }
  return out;
}

const files = ['app.js', 'config.js', 'boot-fallback.js', 'eslint.config.js']
  .map((f) => path.join(ROOT, f))
  .filter((f) => existsSync(f))
  .concat(collect(path.join(ROOT, 'lib')), collect(path.join(ROOT, 'tools')), collect(path.join(ROOT, 'tests')));

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  const rel = path.relative(ROOT, file);
  if (res.status === 0) {
    console.log(`ok    ${rel}`);
  } else {
    failed++;
    console.error(`BLAD  ${rel}\n${(res.stderr || '').trim()}`);
  }
}

console.log(`\nSprawdzono ${files.length} plikow, bledow: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
