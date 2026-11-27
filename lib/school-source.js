// ============================================================================
//  lib/school-source.js
//  Zamiana wierszy z bazy eDzienniczka (sprawdziany, zmiany planu, plan lekcji)
//  na wezel `school` w RTDB. Czyste funkcje - bez SQL, HTTP i DOM, dzieki
//  czemu tools/publish-school.mjs jest cienkie, a logika ma testy.
// ============================================================================

import { addISODays, cleanText, clampBytes, isoWeekday } from './plan-utils.js';

const LIMITS = Object.freeze({
  ID: 40, SUBJECT: 40, TYPE: 30, CONTENT: 500, TEACHER: 60,
  OPIS: 240, EFFECT: 60, ROOM: 24, TIME: 24
});

const text = (value, max) => clampBytes(cleanText(value, max), max);

/** Nazwa przedmiotu do porownan: male litery, pojedyncze spacje, bez kropki na koncu. */
export function normSubject(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

/**
 * Nazwa przedmiotu z dziennika -> nazwa uzywana w planie (cfg.subjectOptions).
 * Kolejnosc: dokladne dopasowanie, aliasy z cfg.school.aliases, '' gdy nie znaleziono.
 */
export function resolvePlanSubject(rawName, cfg) {
  const n = normSubject(rawName);
  if (!n) return '';
  const options = Array.isArray(cfg?.subjectOptions) ? cfg.subjectOptions : [];
  const direct = options.find((opt) => normSubject(opt) === n);
  if (direct) return direct;
  const aliases = cfg?.school?.aliases || {};
  for (const [from, to] of Object.entries(aliases)) {
    if (normSubject(from) === n) {
      const canonical = options.find((opt) => normSubject(opt) === normSubject(to));
      return canonical || to;
    }
  }
  return '';
}

/** Kod przedmiotu z pola raw sprawdzianu (Subject.Kod), odporny na smieci. */
export function examKod(raw) {
  if (!raw) return '';
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return '';
    }
  }
  return String(data?.Subject?.Kod || '');
}

/**
 * Numer lekcji (1-based) dla sprawdzianu danego dnia i przedmiotu.
 * Najpierw rzeczywisty plan dnia z dziennika (`plan`), potem plan tygodniowy
 * z config.js. 0 = nie udalo sie przypisac.
 */
export function resolveExamLesson({ date, subject, kod }, cfg, planRows = []) {
  const key = resolvePlanSubject(kod, cfg) || resolvePlanSubject(subject, cfg);
  if (!key) return 0;

  const rows = planRows
    .filter((row) => row && row.date === date)
    .filter((row) => resolvePlanSubject(row.subject, cfg) === key)
    .sort((a, b) => Number(a.lesson_no) - Number(b.lesson_no));
  if (rows.length) {
    const lesson = Number(rows[0].lesson_no);
    if (Number.isInteger(lesson) && lesson >= 1 && lesson <= cfg.times.length) return lesson;
  }

  const weekday = isoWeekday(date);
  const defaults = Array.isArray(cfg.defaultLessons) ? cfg.defaultLessons[weekday - 1] : null;
  if (Array.isArray(defaults)) {
    const index = defaults.findIndex(
      (l) => l && !l.empty && normSubject(l.name) === normSubject(key)
    );
    if (index >= 0) return index + 1;
  }
  return 0;
}

/**
 * Buduje payload wezla `school` dla jednej klasy.
 * Zwraca { payload, warnings, counts }.
 *
 * `exams`/`changes`/`planRows` to surowe wiersze z tabel eDzienniczka.
 * Sprawdziany i zmiany spoza okna [jutro, jutro+horizonDays] sa odrzucane -
 * w bazie nie zostaja wpisy, ktore juz sie odbylo.
 */
export function buildSchoolPayload({
  cfg,
  account,
  todayIso,
  horizonDays = 21,
  exams = [],
  changes = [],
  planRows = [],
  now = Date.now()
} = {}) {
  const warnings = [];
  const examRows = Array.isArray(exams) ? exams : [];
  const changeRows = Array.isArray(changes) ? changes : [];
  const plan = Array.isArray(planRows) ? planRows : [];
  const slotMax = Array.isArray(cfg?.times) ? cfg.times.length : 0;
  const from = addISODays(todayIso, 1);
  const to = addISODays(todayIso, Math.max(1, horizonDays));
  const inWindow = (date) => Boolean(from && to && date >= from && date <= to);

  const outExams = {};
  for (const row of examRows) {
    if (!row || typeof row !== 'object') continue;
    const date = String(row.date || '');
    if (!inWindow(date)) continue;
    const subject = text(row.subject, LIMITS.SUBJECT);
    if (!subject) continue;
    const kod = examKod(row.raw);
    const lesson = resolveExamLesson({ date, subject, kod }, cfg, plan);
    if (!lesson) {
      warnings.push(`sprawdzian ${date} ${subject}: nie znaleziono lekcji w planie - pominiety`);
      continue;
    }
    const id = text(row.id, LIMITS.ID);
    if (!id) {
      warnings.push(`sprawdzian ${date} ${subject}: brak identyfikatora - pominiety`);
      continue;
    }
    outExams[id] = {
      date,
      lesson,
      subject,
      type: text(row.type, LIMITS.TYPE),
      content: text(row.content, LIMITS.CONTENT),
      teacher: text(row.teacher, LIMITS.TEACHER)
    };
  }

  const outChanges = {};
  for (const row of changeRows) {
    if (!row || typeof row !== 'object') continue;
    const date = String(row.date || '');
    if (!inWindow(date)) continue;
    const lesson = Number(row.lesson_no);
    if (!Number.isInteger(lesson) || lesson < 1 || lesson > slotMax) continue;
    const subject = text(row.subject, LIMITS.SUBJECT);
    if (!subject) continue;
    const id = text(row.id, LIMITS.ID);
    if (!id) continue;

    const effect = text(row.efekt, LIMITS.EFFECT);
    let opis = text(row.opis, LIMITS.OPIS);
    if (!opis) {
      const subSubject = text(row.sub_przedmiot, LIMITS.SUBJECT);
      const subTeacher = text(row.sub_nauczyciel, LIMITS.TEACHER);
      const subRoom = text(row.sub_sala, LIMITS.ROOM);
      opis = [effect, subSubject, subTeacher, subRoom].filter(Boolean).join(' · ') || 'zmiana w planie';
    }
    const newLesson = Number(row.sub_lekcja);
    outChanges[id] = {
      date,
      lesson,
      subject,
      opis,
      effect,
      subSubject: text(row.sub_przedmiot, LIMITS.SUBJECT),
      subTeacher: text(row.sub_nauczyciel, LIMITS.TEACHER),
      subRoom: text(row.sub_sala, LIMITS.ROOM),
      newLesson: Number.isInteger(newLesson) && newLesson > 0 ? newLesson : 0,
      time: text(row.sub_godzina, LIMITS.TIME)
    };
  }

  return {
    payload: {
      updatedAt: Number(now),
      source: text(account, 20),
      window: { from, to },
      exams: outExams,
      changes: outChanges
    },
    warnings,
    counts: {
      exams: Object.keys(outExams).length,
      changes: Object.keys(outChanges).length
    }
  };
}
