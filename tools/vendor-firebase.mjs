// ============================================================================
//  vendor-firebase.mjs
//  Pobiera modularne SDK Firebase (ESM) z gstatic i zapisuje je lokalnie w
//  vendor/firebase/<wersja>/, przepisujac absolutne importy na wzgledne.
//
//  Dlaczego: aplikacja nie zalezy wtedy od dostepnosci CDN gstatic (sieci
//  szkolne czesto go blokuja = biala strona), a CSP moze byc scisle
//  (script-src 'self').
//
//  Uzycie:  npm run vendor:firebase
// ============================================================================

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const VERSION = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}`;
// Pliki wymagane przez aplikacje (firebase-database/auth importuja firebase-app)
const FILES = ['firebase-app.js', 'firebase-database.js', 'firebase-auth.js'];
const OUT_DIR = path.join('vendor', 'firebase', VERSION);

await mkdir(OUT_DIR, { recursive: true });

const manifest = { version: VERSION, source: BASE, generatedAt: new Date().toISOString(), files: {} };

for (const name of FILES) {
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${res.statusText}`);
  const upstream = await res.text();

  const local = upstream
    // absolutne importy miedzy plikami SDK -> importy wzgledne
    .replaceAll(`"${BASE}/`, '"./')
    .replaceAll(`'${BASE}/`, "'./")
    // sourceMappingURL wskazujacy na CDN usuwamy (mapy nie sa vendorowane)
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '');

  await writeFile(path.join(OUT_DIR, name), local, 'utf8');

  manifest.files[name] = {
    bytes: Buffer.byteLength(local, 'utf8'),
    sha256: createHash('sha256').update(local).digest('hex'),
    upstreamSha256: createHash('sha256').update(upstream).digest('hex')
  };
  console.log(`${name.padEnd(22)} ${manifest.files[name].bytes} B  sha256=${manifest.files[name].sha256}`);
}

await writeFile(path.join(OUT_DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\nZapisano ${FILES.length} pliki + MANIFEST.json w ${OUT_DIR}`);
