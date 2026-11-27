// ============================================================================
//  tools/publish-school.mjs
//  Publikuje sprawdziany i zmiany planu z bazy eDzienniczka do RTDB planu.
//
//  Uruchamiane z hosta (cron co 30 min) po synchronizacji dziennika:
//    node tools/publish-school.mjs [--dry-run] [--json] [--quiet]
//                                  [--class=5a|4ta] [--today=RRRR-MM-DD]
//
//  Token: FIREBASE_ACCESS_TOKEN albo `gcloud auth print-access-token`.
//  Zapis idzie przez REST z kontem Google wlasciciela projektu (omija reguly
//  RTDB), a odczyt publiczny zapewnia regula "school": { ".read": true }.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { CLASS_5A, CLASS_4TA } from '../config.js';
import { addISODays, warsawToday } from '../lib/plan-utils.js';
import { buildSchoolPayload } from '../lib/school-source.js';

const CLASSES = [CLASS_5A, CLASS_4TA];
const HORIZON_DAYS = 21;
const CONFIG_DIR = process.env.EDUVULCAN_CONFIG_DIR || path.join(homedir(), '.config', 'eduvulcan');

function parseArgs(argv) {
  const opts = { dryRun: false, json: false, quiet: false, classId: '', today: '' };
  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--json') { opts.json = true; opts.dryRun = true; }
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg.startsWith('--class=')) opts.classId = arg.slice(8).toLowerCase();
    else if (arg.startsWith('--today=')) opts.today = arg.slice(8);
    else if (arg === '--help' || arg === '-h') {
      console.log('Uzycie: node tools/publish-school.mjs [--dry-run] [--json] [--quiet] [--class=5a|4ta] [--today=RRRR-MM-DD]');
      process.exit(0);
    } else {
      throw new Error(`Nieznany argument: ${arg}`);
    }
  }
  return opts;
}

function plural(n, one, few, many) {
  if (n === 1) return `${n} ${one}`;
  const rest = n % 10;
  const tens = n % 100;
  if (rest >= 2 && rest <= 4 && !(tens >= 12 && tens <= 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

function readAccounts() {
  const file = path.join(CONFIG_DIR, 'accounts.json');
  if (!existsSync(file)) throw new Error(`Brak ${file} - najpierw podlacz eDzienniczek (eduvulcan login).`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(data?.accounts) ? data.accounts : [];
  const map = new Map();
  for (const account of list) {
    if (account?.name && account?.pupilId) map.set(String(account.name), String(account.pupilId));
  }
  return map;
}

function dbPathFor(pupilId) {
  const perPupil = path.join(CONFIG_DIR, `data-${pupilId}.db`);
  if (existsSync(perPupil)) return perPupil;
  const single = path.join(CONFIG_DIR, 'data.db');
  if (existsSync(single)) {
    // Legacy baza nie jest powiazana z konkretnym uczniem - czytamy z niej tylko
    // wtedy, gdy NIE ma zadnej per-uczen bazy, i tylko gdy jest pusta albo ma
    // wpis meta o uczniu. Inaczej moglibysmy opublikowac cudze dane.
    const exists = dbFileHasPupil(single, pupilId);
    if (exists === true) return single;
    if (exists === null && isDbEmpty(single)) return single;
    throw new Error(
      `Legacy data.db nie jest powiazana z uczniem ${pupilId} ani nie jest pusta - sprobuj zsynchronizowac eDzienniczek (eduvulcan sync).`
    );
  }
  throw new Error(`Brak bazy dziennika dla ucznia ${pupilId} (szukano ${perPupil}).`);
}

// Zwraca true, gdy baza ma wpis meta o uczniu; false, gdy ma dane innego ucznia;
// null, gdy nie ma tabeli meta (nie wiemy, czyja to baza).
function dbFileHasPupil(file, pupilId) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const meta = db.prepare("select value from meta where key = 'pupil'").get();
      if (!meta || !meta.value) return null;
      const parsed = JSON.parse(meta.value);
      return String(parsed?.id) === String(pupilId);
    } finally {
      db.close();
    }
  } catch (e) {
    return null;
  }
}

function isDbEmpty(file) {
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      for (const table of ['exams', 'plan', 'plan_changes']) {
        try {
          const n = db.prepare(`select count(*) n from ${table}`).get().n;
          if (n > 0) return false;
        } catch (e) { /* tabela moze nie istniec w starej bazie */ }
      }
      return true;
    } finally {
      db.close();
    }
  } catch (e) {
    return false;
  }
}

function readRows(cfg, account, pupilId, todayIso) {
  const from = addISODays(todayIso, 0);
  const to = addISODays(todayIso, HORIZON_DAYS);
  if (!from || !to) throw new Error(`Nieprawidlowa data: ${todayIso}`);
  if (!cfg?.school?.account) throw new Error(`Klasa ${cfg.id}: brak konfiguracji school.account`);

  const db = new DatabaseSync(dbPathFor(pupilId));
  try {
    // Cron eDzienniczka moze w tej chwili pisac do bazy - krotko czekamy na zwolnienie.
    db.exec('PRAGMA busy_timeout = 3000');
    const exams = db.prepare(
      'select id, date, subject, type, content, teacher, raw from exams where date >= ? and date <= ?'
    ).all(from, to);
    const changes = db.prepare(
      `select id, date, lesson_no, subject, opis, efekt, sub_przedmiot, sub_nauczyciel,
              sub_sala, sub_lekcja, sub_godzina
         from plan_changes where date >= ? and date <= ?`
    ).all(from, to);
    const planRows = db.prepare(
      'select date, lesson_no, subject from plan where date >= ? and date <= ?'
    ).all(from, to);
    return { exams, changes, planRows, from, to };
  } finally {
    db.close();
  }
}

function accessToken() {
  const fromEnv = String(process.env.FIREBASE_ACCESS_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (err) {
    const detail = String(err?.stderr || err?.message || '').trim().split('\n')[0];
    throw new Error(`Nie udalo sie pobrac tokenu Google (gcloud): ${detail || 'brak gcloud'}`);
  }
}

async function putSchoolNode(databaseURL, token, payload, expected) {
  const base = String(databaseURL || '').replace(/\/+$/, '');
  if (!base) throw new Error('Brak databaseURL w konfiguracji klasy');
  const url = `${base}/school.json?access_token=${encodeURIComponent(token)}`;
  const body = JSON.stringify(payload);

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body
  });
  if (!res.ok) throw new Error(`zapis RTDB: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);

  // Weryfikacja: czytamy z powrotem to, co ma zobaczyc aplikacja.
  const check = await fetch(url, { headers: { accept: 'application/json' } });
  if (!check.ok) throw new Error(`odczyt kontrolny RTDB: HTTP ${check.status}`);
  const stored = await check.json();
  const got = {
    exams: stored?.exams ? Object.keys(stored.exams).length : 0,
    changes: stored?.changes ? Object.keys(stored.changes).length : 0
  };
  if (got.exams !== expected.exams || got.changes !== expected.changes) {
    throw new Error(`weryfikacja RTDB nie zgadza sie: zapisano ${expected.exams}/${expected.changes}, jest ${got.exams}/${got.changes}`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const todayIso = /^\d{4}-\d{2}-\d{2}$/.test(opts.today) ? opts.today : warsawToday();
  const accounts = readAccounts();
  const classes = opts.classId ? CLASSES.filter((c) => c.id === opts.classId) : CLASSES;
  if (!classes.length) throw new Error(`Nieznana klasa: ${opts.classId}`);

  let token = '';
  if (!opts.dryRun) token = accessToken();

  const results = [];
  const failures = [];

  for (const cfg of classes) {
    const account = cfg.school?.account;
    const pupilId = accounts.get(String(account));
    try {
      if (!pupilId) throw new Error(`brak konta "${account}" w accounts.json`);
      const rows = readRows(cfg, account, pupilId, todayIso);
      const { payload, warnings, counts } = buildSchoolPayload({
        cfg, account, todayIso, horizonDays: HORIZON_DAYS,
        exams: rows.exams, changes: rows.changes, planRows: rows.planRows
      });
      if (!opts.quiet) {
        warnings.forEach((w) => console.error(`[${cfg.id}] uwaga: ${w}`));
      }
      if (!opts.dryRun) await putSchoolNode(cfg.firebaseConfig.databaseURL, token, payload, counts);
      results.push({ cfg, counts, payload });
    } catch (err) {
      failures.push(`${cfg.id}: ${err.message}`);
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(results.map((r) => ({ class: r.cfg.id, counts: r.counts, payload: r.payload })), null, 2));
  } else if (!opts.quiet) {
    for (const { cfg, counts, payload } of results) {
      const suffix = opts.dryRun ? ' (dry-run)' : ' → zapisano';
      console.log(
        `${cfg.id} (${payload.source}): ${plural(counts.exams, 'sprawdzian', 'sprawdziany', 'sprawdzianów')}, ` +
        `${plural(counts.changes, 'zmiana', 'zmiany', 'zmian')}${suffix}`
      );
    }
  }

  if (failures.length) {
    for (const failure of failures) console.error(`BŁĄD ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`BŁĄD publikacji: ${err.message}`);
  process.exitCode = 1;
});
