// ============================================================================
//  app.js - wspolna logika planu lekcji (klasy 5a i 4Ta)
//
//  Klasa wybierana jest w config.js (po adresie hosta albo parametrem ?klasa=).
//  Zapis do bazy ma wylacznie zalogowany administrator z wpisem w node
//  "admins" (patrz database.rules.json). Dane z bazy sa escapowane (esc()).
// ============================================================================

import { initializeApp } from './vendor/firebase/10.12.2/firebase-app.js';
import { getDatabase, ref, get, update, onValue } from './vendor/firebase/10.12.2/firebase-database.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './vendor/firebase/10.12.2/firebase-auth.js';
import { CLASS_CONFIG } from './config.js';
import {
  esc,
  normalizeLesson,
  mergeDays,
  hasAnyLesson,
  dayTimeRange,
  subjectOptionsFor,
  activeBadge,
  nextBadge,
  saveErrorMessage,
  authErrorMessage,
  warsawToday,
  buildSchoolOverlay,
  examMarker,
  shortDate,
  longDate,
  relativeDay,
  LIMITS,
  EMPTY_ICON,
  FALLBACK_ICON
} from './lib/plan-utils.js';

// --- Dane z konfiguracji wybranej klasy ---
const app = initializeApp(CLASS_CONFIG.firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const CLASS_ID = CLASS_CONFIG.id;
const SUBJECT_MAP = CLASS_CONFIG.subjectMap;
const SUBJECT_OPTIONS = CLASS_CONFIG.subjectOptions;
const TIMES = CLASS_CONFIG.times;
const DEFAULT_LESSONS = CLASS_CONFIG.defaultLessons;

const DAY_META = [
  { dayNum: 1, mobileClass: 'day-pon', colClass: 'col-pon', name: 'Poniedziałek', shortName: 'Pon' },
  { dayNum: 2, mobileClass: 'day-wt',  colClass: 'col-wt',  name: 'Wtorek',      shortName: 'Wt'  },
  { dayNum: 3, mobileClass: 'day-sr',  colClass: 'col-sr',  name: 'Środa',       shortName: 'Śr'  },
  { dayNum: 4, mobileClass: 'day-czw', colClass: 'col-czw', name: 'Czwartek',    shortName: 'Czw' },
  { dayNum: 5, mobileClass: 'day-pt',  colClass: 'col-pt',  name: 'Piątek',      shortName: 'Pt'  }
];

// Klucze localStorage osobne per klasa (5a i 4Ta nie nadpisuja sobie cache)
const CACHE_KEY = `plan_${CLASS_ID}_offline`;
const THEME_KEY = 'schedule_theme';

let daysData = mergeDays(DAY_META, DEFAULT_LESSONS, null, TIMES, SUBJECT_MAP).days;
let isAdmin = false;
let activeSubject = null;
let noticeSource = null;

// --- Nakladka z dziennika: sprawdziany i zmiany w planie -------------------
// schoolRaw: ostatnie dane z bazy (`school`), schoolOverlay: policzona nakladka
// dla wyswietlanego tygodnia (daty w naglowkach sa zawsze, takze bez danych).
let schoolRaw = null;
let overlayToday = warsawToday();
let schoolOverlay = buildSchoolOverlay(null, { todayIso: overlayToday, times: TIMES, dayMeta: DAY_META });
// Minuta, w ktorej trzeba przeliczyc nakladke: koniec lekcji z dzisiejszym
// wpisem albo (w piatek) koniec zajec i przejscie na nastepny tydzien.
let overlayRefreshAt = Number.POSITIVE_INFINITY;

// Komunikaty dla uzytkownika wystawia boot-fallback.js (dziala takze wtedy,
// gdy app.js w ogole sie nie uruchomi).
function planNotice(message, isError) {
  if (typeof window.planNotice === 'function') window.planNotice(message, isError);
}

function showNotice(message, source, isError) {
  noticeSource = source;
  planNotice(message, isError);
}

function clearNotice(source) {
  if (noticeSource !== source) return;
  noticeSource = null;
  planNotice('');
}

// Ustaw tytuł strony, nagłówek i wychowawcę na podstawie konfiguracji klasy
function applyClassBranding() {
  document.title = CLASS_CONFIG.title;
  const h1 = document.getElementById('classHeading');
  const wych = document.getElementById('classTeacher');
  if (h1) h1.textContent = CLASS_CONFIG.heading;
  if (wych) wych.textContent = CLASS_CONFIG.teacher;
  const art = document.getElementById('sheetArt');
  if (art) {
    if (CLASS_CONFIG.showArt && CLASS_CONFIG.artSvg) {
      // artSvg to statyczna grafika z config.js (nie dane uzytkownika)
      art.innerHTML = CLASS_CONFIG.artSvg;
      art.style.display = '';
    } else {
      art.style.display = 'none';
    }
  }
  // Link do drugiego planu (dyskretna strzalka w rogu)
  const link = document.getElementById('otherPlanLink');
  if (link && CLASS_CONFIG.other) {
    const o = CLASS_CONFIG.other;
    // Jesli klasa wymuszona przez ?klasa= (tryb lokalny/testowy) - przelaczamy parametr,
    // w przeciwnym razie prowadzimy na wlasciwy adres drugiej klasy.
    const forced = new URLSearchParams(window.location.search).get('klasa');
    link.href = forced ? `?klasa=${o.id}` : o.url;
    link.title = o.label;
    const txt = link.querySelector('.opl-text');
    if (txt) txt.textContent = o.label;
    link.style.display = '';
  }

  // Naglowek gotowy - odslaniamy (byl ukryty, by nie migac placeholderem)
  const header = document.getElementById('pageHeader');
  if (header) header.classList.remove('header-loading');
}

// --- Plan offline w localStorage (awaryjnie, gdy brak sieci) ---------------
function cacheSchedule(days) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      at: Date.now(),
      days: days.map(d => ({ lessons: d.lessons }))
    }));
  } catch (e) {
    // brak miejsca albo tryb prywatny - cache pomijamy
  }
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.days)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function applyDays(fbDays, options = {}) {
  const { days, warnings } = mergeDays(DAY_META, DEFAULT_LESSONS, fbDays, TIMES, SUBJECT_MAP);
  daysData = days;
  warnings.forEach(w => console.warn('[plan] ' + w));
  // Plan wbudowany w aplikacje nie trafia do cache - cache ma trzymac dane z bazy.
  if (options.saveCache !== false) cacheSchedule(days);
  renderDesktop();
  renderMobile();
  updateStatus();
}

// Awaria bazy nie moze zostawic strony bez lekcji: plan wbudowany w aplikacje
// (config.js) jest prawdziwym planem klasy, wiec pokazujemy go zawsze, a cache
// tylko go zastepuje, gdy zawiera realne lekcje.
function showCachedPlan(reason) {
  const cached = readCache();
  if (cached && hasAnyLesson(cached.days)) {
    applyDays(cached.days, { saveCache: false });
    const when = new Date(cached.at).toLocaleString('pl-PL');
    showNotice(`${reason} Pokazuję plan zapamiętany ${when}.`, 'data', true);
    return;
  }
  showNotice(`${reason} Pokazuję plan zapisany w aplikacji (może być nieaktualny).`, 'data', true);
}

// Pierwszy odczyt przez get() (plan z config.js jest juz na ekranie), a potem
// onValue() - dzieki temu zmiany wprowadzone przez innego administratora
// pojawiaja sie na otwartej stronie bez odswiezania.
async function initSchedule() {
  // Plan z config.js rysujemy od razu: strona nie jest pusta, zanim odpowie baza.
  applyDays(null, { saveCache: false });

  try {
    const snapshot = await get(ref(db, 'schedule/days'));
    clearNotice('data');
    applyDays(snapshot.val());
  } catch (err) {
    console.warn('Błąd pobierania z Firebase:', err.message);
    showCachedPlan('Brak połączenia z bazą planu.');
    return;
  }

  onValue(ref(db, 'schedule/days'), snapshot => {
    clearNotice('data');
    applyDays(snapshot.val());
  }, err => {
    console.warn('Błąd nasłuchu zmian w Firebase:', err.message);
    showCachedPlan('Utracono połączenie z bazą planu.');
  });
}

// Nakladka ze sprawdzianami i zmianami planu lezy w osobnym wezle `school`
// (zapisuje ja tylko narzedzie z hosta, po synchronizacji dziennika).
async function initSchool() {
  try {
    const snapshot = await get(ref(db, 'school'));
    schoolRaw = snapshot.val();
    refreshOverlay();
    renderDesktop();
    renderMobile();
    updateStatus();
  } catch (err) {
    // Brak wpisu/uprawnien nie moze psuc samego planu - zostaje wersja bez znacznikow.
    console.warn('Brak danych o sprawdzianach z bazy:', err.message);
  }

  onValue(ref(db, 'school'), snapshot => {
    schoolRaw = snapshot.val();
    refreshOverlay();
    renderDesktop();
    renderMobile();
    updateStatus();
  }, err => {
    console.warn('Blad nasluchu sprawdzianow:', err.message);
  });
}

// --- Renderowanie ----------------------------------------------------------
// Klucz przedmiotu do podswietlania i porownan (dane z bazy sa escapowane przy
// wstawianiu do HTML, takze w atrybutach).
function subjectKey(lesson) {
  return String(lesson?.name || '').toLowerCase().trim();
}

function getWarsawTime() {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(new Date()).forEach(p => { parts[p.type] = parseInt(p.value, 10); });

  const h = parts.hour === 24 ? 0 : parts.hour;
  return { day: new Date(parts.year, parts.month - 1, parts.day, h, parts.minute).getDay(), mins: h * 60 + parts.minute };
}

// --- Znaczniki sprawdzianow i zmian w planie --------------------------------
// Koniec ostatniej lekcji dnia (0, gdy dzien wolny) - po nim w piatek plan
// przechodzi na nastepny tydzien.
function currentDayEndMins() {
  const { day } = getWarsawTime();
  const lessons = daysData[day - 1]?.lessons;
  if (!Array.isArray(lessons)) return 0;
  let last = -1;
  lessons.forEach((l, i) => { if (l && !l.empty) last = i; });
  return last >= 0 ? Number(TIMES[last]?.e) || 0 : 0;
}

// Najblizszy moment, w ktorym nakladka sie zmieni: koniec lekcji z dzisiejszym
// sprawdzianem/zmiana albo koniec zajec w piatek.
function nextOverlayRefreshAt(nowMins, dayEndMins) {
  let next = Number.POSITIVE_INFINITY;
  const dayIdx = currentDayIndex();
  if (dayIdx < 0) return next;
  const dayOverlay = schoolOverlay?.days?.[dayIdx];
  if (dayOverlay) {
    dayOverlay.slots.forEach((slot, slotIndex) => {
      if (!slot) return;
      const end = Number(TIMES[slotIndex]?.e);
      if (Number.isFinite(end) && end > nowMins) next = Math.min(next, end);
    });
  }
  const { day } = getWarsawTime();
  // Po ostatniej lekcji dzisiejsza kolumna przechodzi na nastepny tydzien.
  if (day >= 1 && day <= daysData.length && nowMins <= dayEndMins) {
    next = Math.min(next, dayEndMins + 1);
  }
  return next;
}

function refreshOverlay() {
  overlayToday = warsawToday();
  const { mins } = getWarsawTime();
  const dayEndMins = currentDayEndMins();
  schoolOverlay = buildSchoolOverlay(schoolRaw, {
    todayIso: overlayToday,
    nowMins: mins,
    dayEndMins,
    times: TIMES,
    dayMeta: DAY_META
  });
  overlayRefreshAt = nextOverlayRefreshAt(mins, dayEndMins);
  renderLegend();
}

function overlaySlot(dayIndex, slotIndex) {
  return schoolOverlay?.days?.[dayIndex]?.slots?.[slotIndex] || null;
}

function overlayDay(dayIndex) {
  return schoolOverlay?.days?.[dayIndex] || null;
}

// Kolumna odpowiadajaca dzisiejszej dacie; -1 gdy plan pokazuje inny tydzien
// (np. w piatek po poludniu widac juz nastepny tydzien).
function currentDayIndex() {
  const idx = schoolOverlay?.days?.findIndex(d => d.iso && d.iso === overlayToday);
  return Number.isInteger(idx) ? idx : -1;
}

function examsPinsHtml(slot, dayIndex, slotIndex) {
  if (!slot || !slot.exams.length) return '';
  const first = slot.exams[0];
  const label = `${first.type || 'Sprawdzian'}: ${first.subject}, ${shortDate(first.date)}`;
  const extra = slot.exams.length > 1 ? `<span class="ov-count">${slot.exams.length}</span>` : '';
  return `<button type="button" class="ov-pin ov-exam" data-tip-day="${dayIndex}" data-tip-slot="${slotIndex}" title="${esc(label)}" aria-label="${esc(label)}">${esc(examMarker(first.type))}${extra}</button>`;
}

function changesPinsHtml(slot, dayIndex, slotIndex) {
  if (!slot || !slot.changes.length) return '';
  const first = slot.changes[0];
  const label = `Zmiana w planie: ${first.subject}, ${shortDate(first.date)} — ${first.opis}`;
  const extra = slot.changes.length > 1 ? `<span class="ov-count">${slot.changes.length}</span>` : '';
  return `<button type="button" class="ov-pin ov-change" data-tip-day="${dayIndex}" data-tip-slot="${slotIndex}" title="${esc(label)}" aria-label="${esc(label)}">🔄${extra}</button>`;
}

// Kafelki na desktopie: male pieczatki w rogu (klik = dymek ze szczegolami).
function overlayPinsHtml(slot, dayIndex, slotIndex) {
  const pins = examsPinsHtml(slot, dayIndex, slotIndex) + changesPinsHtml(slot, dayIndex, slotIndex);
  return pins ? `<div class="ov-pins">${pins}</div>` : '';
}

// Na telefonie pelnowidthowe paski pod lekcja - latwiejsze do trafienia niz rog kafelka.
function overlayNotesHtml(slot, dayIndex, slotIndex) {
  if (!slot) return '';
  const out = [];
  if (slot.exams.length) {
    const first = slot.exams[0];
    const extra = slot.exams.length > 1 ? ` +${slot.exams.length - 1}` : '';
    out.push(`<button type="button" class="ov-line ov-exam" data-tip-day="${dayIndex}" data-tip-slot="${slotIndex}" aria-label="${esc(first.type || 'Sprawdzian')}: ${esc(first.subject)}, ${esc(shortDate(first.date))}">
      <span class="ov-line-ico">${esc(examMarker(first.type))}</span>
      <span class="ov-line-txt">${esc(first.type || 'Sprawdzian')} · ${esc(shortDate(first.date))}${esc(extra)}</span>
    </button>`);
  }
  if (slot.changes.length) {
    const first = slot.changes[0];
    const extra = slot.changes.length > 1 ? ` +${slot.changes.length - 1}` : '';
    out.push(`<button type="button" class="ov-line ov-change" data-tip-day="${dayIndex}" data-tip-slot="${slotIndex}" aria-label="Zmiana w planie: ${esc(first.subject)}, ${esc(shortDate(first.date))}">
      <span class="ov-line-ico">🔄</span>
      <span class="ov-line-txt">Zmiana w planie · ${esc(shortDate(first.date))}${esc(extra)}</span>
    </button>`);
  }
  return out.join('');
}

function overlayUpdatedLabel() {
  const ts = schoolOverlay?.updatedAt;
  if (!ts) return '';
  try {
    const when = new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date(ts));
    return ` · aktualizacja ${when}`;
  } catch (e) {
    return '';
  }
}

function renderLegend() {
  const el = document.getElementById('overlayLegend');
  if (!el) return;
  if (!schoolRaw) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const count = schoolOverlay?.count || { exams: 0, changes: 0 };
  const range = schoolOverlay?.from && schoolOverlay?.to
    ? (schoolOverlay.from === schoolOverlay.to
      ? shortDate(schoolOverlay.from)
      : `${shortDate(schoolOverlay.from)}–${shortDate(schoolOverlay.to)}`)
    : '';
  let html = '';
  if (!count.exams && !count.changes) {
    html = `<span class="ovl-empty">Brak sprawdzianów i zmian w planie${range ? ` (${esc(range)})` : ''}.</span>`;
  } else {
    const keys = [];
    if (count.exams) keys.push('📝 sprawdzian · ✏️ kartkówka');
    if (count.changes) keys.push('🔄 zmiana w planie');
    html = `<span class="ovl-keys">${keys.join(' · ')} — dotknij znacznika, aby zobaczyć szczegóły</span>`;
    if (range) html += `<span class="ovl-range">Z dziennika · ${esc(range)}${esc(overlayUpdatedLabel())}</span>`;
  }
  el.innerHTML = html;
  el.hidden = false;
}

function openTip(dayIndex, slotIndex) {
  const slot = overlaySlot(dayIndex, slotIndex);
  const day = overlayDay(dayIndex);
  const overlayEl = document.getElementById('tipOverlay');
  const body = document.getElementById('tipBody');
  if (!slot || !day || !overlayEl || !body) return;

  const time = TIMES[slotIndex];
  const lesson = daysData[dayIndex]?.lessons?.[slotIndex];
  const items = [];

  slot.exams.forEach(exam => {
    const when = [longDate(exam.date), relativeDay(exam.date, overlayToday)].filter(Boolean).join(' · ');
    const meta = [
      `lekcja ${time ? time.num : exam.lesson}`,
      time ? time.dTime : '',
      lesson && lesson.room && lesson.room !== '—' ? `sala ${lesson.room}` : ''
    ].filter(Boolean).join(' · ');
    items.push(`<div class="tip-item">
      <div class="tip-head">
        <span class="tip-ico">${esc(examMarker(exam.type))}</span>
        <div><div class="tip-title">${esc(exam.type || 'Sprawdzian')}</div><div class="tip-subject">${esc(exam.subject)}</div></div>
      </div>
      <div class="tip-meta">${esc(when)}${meta ? ` · ${esc(meta)}` : ''}</div>
      ${exam.content ? `<div class="tip-material"><span class="tip-label">Materiał:</span><br>${esc(exam.content)}</div>` : ''}
      ${exam.teacher ? `<div class="tip-extra">Nauczyciel: ${esc(exam.teacher)}</div>` : ''}
    </div>`);
  });

  slot.changes.forEach(change => {
    const when = [longDate(change.date), relativeDay(change.date, overlayToday)].filter(Boolean).join(' · ');
    const meta = [
      `lekcja ${time ? time.num : change.lesson}`,
      time ? time.dTime : '',
      lesson && lesson.room && lesson.room !== '—' ? `sala ${lesson.room}` : ''
    ].filter(Boolean).join(' · ');
    items.push(`<div class="tip-item">
      <div class="tip-head">
        <span class="tip-ico">🔄</span>
        <div><div class="tip-title">Zmiana w planie</div><div class="tip-subject">${esc(change.subject)}</div></div>
      </div>
      <div class="tip-meta">${esc(when)}${meta ? ` · ${esc(meta)}` : ''}</div>
      <div class="tip-material">${esc(change.opis)}</div>
      ${change.effect ? `<span class="tip-chip">${esc(change.effect)}</span>` : ''}
    </div>`);
  });

  body.innerHTML = items.join('');
  overlayEl.hidden = false;
  overlayEl.classList.add('open');
  const closeBtn = document.getElementById('tipClose');
  if (closeBtn) closeBtn.focus();
}

function closeTip() {
  const overlayEl = document.getElementById('tipOverlay');
  if (!overlayEl) return;
  overlayEl.classList.remove('open');
  overlayEl.hidden = true;
}

function renderDesktopHead() {
  const thead = document.getElementById('desktopThead');
  if (!thead) return;
  const tr = document.createElement('tr');
  tr.innerHTML = '<th class="timo">Godz.</th>';
  daysData.forEach((day, di) => {
    const range = dayTimeRange(day.lessons, TIMES);
    const ovDay = overlayDay(di);
    const dateLabel = ovDay?.short
      ? (ovDay.iso === overlayToday ? `${ovDay.short} · dziś` : ovDay.short)
      : '';
    const th = document.createElement('th');
    th.innerHTML = `<span class="dh-name">${esc(day.name)}</span>${dateLabel ? `<span class="dh-date">${esc(dateLabel)}</span>` : ''}${range ? `<span class="dh-time">${esc(range)}</span>` : ''}`;
    if (ovDay?.iso && ovDay.iso === overlayToday) th.classList.add('today');
    tr.appendChild(th);
  });
  thead.innerHTML = '';
  thead.appendChild(tr);
}

function renderDesktop() {
  const tbody = document.getElementById('desktopTbody');
  tbody.innerHTML = '';
  renderDesktopHead();
  TIMES.forEach((slot, li) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="nr"><span class="num"><span class="bell">🔔</span><span class="no">${esc(slot.num)}</span><span class="time">${esc(slot.time)}</span></span></td>`;
    daysData.forEach((day, di) => {
      const td = document.createElement('td');
      td.className = `cell ${day.colClass}`;
      const l = day.lessons[li];
      if (!l || l.empty) {
        td.innerHTML = `<div class="tile empty"><span class="txt"><span class="p">&mdash;</span></span></div>`;
        td.insertAdjacentHTML('beforeend', overlayPinsHtml(overlaySlot(di, li), di, li));
      } else {
        td.innerHTML = `<div class="tile" data-subject="${esc(subjectKey(l))}" role="button" tabindex="0" aria-pressed="false"><span class="ico">${esc(l.icon)}</span><span class="txt"><span class="p">${esc(l.name)}</span><span class="s">${esc(l.room)}</span></span></div>`;
        td.insertAdjacentHTML('beforeend', overlayPinsHtml(overlaySlot(di, li), di, li));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderMobile() {
  const wrap = document.getElementById('mobileSchedule');
  wrap.innerHTML = '';
  daysData.forEach((day, di) => {
    const card = document.createElement('div');
    card.className = `day-card ${day.mobileClass}`;
    card.dataset.day = day.dayNum;
    const range = dayTimeRange(day.lessons, TIMES);
    const ovDay = overlayDay(di);
    const dateLabel = ovDay?.short
      ? (ovDay.iso === overlayToday ? `${ovDay.short} · dziś` : ovDay.short)
      : '';
    card.innerHTML = `<div class="day-header">${esc(day.name)}${dateLabel ? `<span class="dh-date">${esc(dateLabel)}</span>` : ''}${range ? `<span class="dh-time">${esc(range)}</span>` : ''}</div>`;
    if (ovDay?.iso && ovDay.iso === overlayToday) card.querySelector('.day-header')?.classList.add('today');
    const lc = document.createElement('div');
    lc.className = 'lessons-container';
    day.lessons.forEach((l, li) => {
      const slotOverlay = overlaySlot(di, li);
      // Pusta lekcja bez znacznikow nie zajmuje miejsca; ze sprawdzianem/zmiana
      // pokazujemy sam pasek przy numerze lekcji (inaczej informacja by znikla).
      if ((!l || l.empty) && !slotOverlay) return;
      const t = TIMES[li];
      const row = document.createElement('div');
      row.className = 'lesson-row';
      row.dataset.lessonIndex = li;
      const main = document.createElement('div');
      main.className = 'lesson-main';
      if (l && !l.empty) {
        const info = document.createElement('div');
        info.className = 'lesson-info';
        info.dataset.subject = subjectKey(l);
        info.setAttribute('role', 'button');
        info.setAttribute('tabindex', '0');
        info.setAttribute('aria-pressed', 'false');
        info.innerHTML = `<div class="lesson-content"><span class="lesson-icon">${esc(l.icon)}</span><div class="lesson-name">${esc(l.name)}</div><div class="lesson-room">${esc(l.room)}</div></div>`;
        main.appendChild(info);
      }
      main.insertAdjacentHTML('beforeend', overlayNotesHtml(slotOverlay, di, li));
      row.innerHTML = `<div class="lesson-time"><span class="bell">🔔</span><span class="no">${esc(t.num)}</span><span class="time">${esc(t.dTime)}</span></div>`;
      row.appendChild(main);
      lc.appendChild(row);
    });
    card.appendChild(lc);
    wrap.appendChild(card);
  });
  renderTabs();
}

// Gdy dzisiejsza kolumna juz przeszla na nastepny tydzien, pierwsza zakladka
// powinna byc najblizszy dzien szkolny (np. w czwartek po lekcjach - piatek),
// a nie zawsze poniedzialek.
function nextSchoolDayIndex() {
  let best = -1;
  let bestIso = '';
  (schoolOverlay?.days || []).forEach((day, i) => {
    if (!day.iso || day.iso <= overlayToday) return;
    if (!bestIso || day.iso < bestIso) {
      bestIso = day.iso;
      best = i;
    }
  });
  return best;
}

function renderTabs() {
  const { mins } = getWarsawTime();
  const idx = currentDayIndex();
  let init = 1;
  if (idx >= 0) {
    const today = daysData[idx];
    const activeLessons = today ? today.lessons.map((l, i) => ({ l, i })).filter(x => x.l && !x.l.empty) : [];
    const lastEnd = activeLessons.length ? TIMES[activeLessons[activeLessons.length - 1].i].e : 840;
    init = mins > lastEnd ? (idx < daysData.length - 1 ? idx + 2 : 1) : idx + 1;
  } else {
    const nextIdx = nextSchoolDayIndex();
    if (nextIdx >= 0) init = nextIdx + 1;
  }
  const tc = document.getElementById('mobileTabs');
  tc.innerHTML = '';
  daysData.forEach(d => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tab-btn${d.dayNum === init ? ' active' : ''}`;
    b.textContent = d.shortName;
    b.onclick = () => switchTab(d.dayNum);
    tc.appendChild(b);
  });
  switchTab(init);
}

function switchTab(n) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i + 1 === n));
  document.querySelectorAll('.day-card').forEach(c => c.classList.toggle('active-tab', +c.dataset.day === n));
}

// Pomocnik: dodaje klase i data-badge do kafelka desktop i mobile dla danego slotu
function markLesson(slotIndex, day, cssClass, badgeText) {
  const row = document.querySelectorAll('#desktopTbody tr')[slotIndex];
  if (row) {
    const tile = row.children[day]?.querySelector('.tile');
    if (tile && !tile.classList.contains('empty')) {
      tile.classList.add(cssClass);
      tile.setAttribute('data-badge', badgeText);
    }
  }
  const mc = document.querySelector(`.day-card[data-day="${day}"]`);
  if (mc) {
    const inf = mc.querySelector(`.lesson-row[data-lesson-index="${slotIndex}"] .lesson-info`);
    if (inf) {
      inf.classList.add(cssClass);
      inf.setAttribute('data-badge', badgeText);
    }
  }
}

function updateStatus() {
  const { mins } = getWarsawTime();
  // Polnoc zmienia tydzien, a koniec lekcji usuwa dzisiejszy wpis; w piatek po
  // ostatniej lekcji plan przechodzi na nastepny tydzien - bez przeladowania.
  if (warsawToday() !== overlayToday || mins >= overlayRefreshAt) {
    refreshOverlay();
    renderDesktop();
    renderMobile();
  }
  document.querySelectorAll('.active-lesson, .next-lesson').forEach(e => {
    e.classList.remove('active-lesson', 'next-lesson');
    e.removeAttribute('data-badge');
  });

  const dayIdx = currentDayIndex();

  // Wyswietlany tydzien nie zawiera dzisiejszej daty (np. piatek -> przyszly
  // tydzien) - nie oznaczamy wtedy zadnej lekcji jako TERAZ/nastepna.
  if (dayIdx < 0) {
    applyHighlight();
    return;
  }
  const today = daysData[dayIdx];
  if (!today) {
    applyHighlight();
    return;
  }

  if (mins < TIMES[0].s || mins > TIMES[TIMES.length - 1].e) {
    applyHighlight();
    return;
  }

  let li = -1, isBreak = false, ni = -1;
  for (let i = 0; i < TIMES.length; i++) {
    if (mins >= TIMES[i].s && mins <= TIMES[i].e) { li = i; break; }
    if (i < TIMES.length - 1 && mins > TIMES[i].e && mins < TIMES[i + 1].s) { isBreak = true; ni = i + 1; break; }
  }

  if (li !== -1) {
    markLesson(li, dayIdx + 1, 'active-lesson', activeBadge(TIMES[li].e - mins));
  } else if (isBreak && ni !== -1) {
    markLesson(ni, dayIdx + 1, 'next-lesson', nextBadge(TIMES[ni].s - mins));
  }
  applyHighlight();
}

function applyHighlight() {
  document.querySelectorAll('.tile,.lesson-info').forEach(t => {
    const empty = t.classList.contains('empty') || !!t.querySelector('.lesson-empty');
    if (!activeSubject) {
      t.classList.remove('dimmed', 'highlighted');
      t.setAttribute('aria-pressed', 'false');
      return;
    }
    const match = !empty && t.dataset.subject === activeSubject;
    t.classList.toggle('highlighted', match);
    t.classList.toggle('dimmed', !match);
    t.setAttribute('aria-pressed', String(match));
  });
}

function toggleSubjectHighlight(el) {
  if (!el || el.classList.contains('empty') || el.querySelector('.lesson-empty')) return;
  const key = el.dataset.subject;
  if (!key) return;
  activeSubject = activeSubject === key ? null : key;
  applyHighlight();
}

// --- Zapis i tozsamosc administratora --------------------------------------
async function saveData(data) {
  const user = auth.currentUser;
  if (!user) {
    throw Object.assign(new Error('Brak zalogowanego administratora'), { code: 'NOT_AUTHENTICATED' });
  }
  // Zapis per dzien (zamiast nadpisywania calego drzewa) + metadane zmiany,
  // zeby dalo sie wykryc, kto i kiedy zapisal plan.
  const updates = { updatedAt: Date.now(), updatedBy: user.uid };
  data.forEach((day, i) => {
    updates[`days/${i}`] = { lessons: day.lessons.map(l => normalizeLesson(l, SUBJECT_MAP)) };
  });
  await update(ref(db, 'schedule'), updates);
}

// 'guest' (niezalogowany) | 'user' (zalogowany bez uprawnien) | 'admin'
function setAdminUi(state) {
  const loginBtn = document.getElementById('adminLoginBtn');
  const editBtn = document.getElementById('editBtn');
  const logoutBtn = document.getElementById('adminLogoutBtn');
  if (loginBtn) loginBtn.style.display = state === 'guest' ? '' : 'none';
  if (editBtn) editBtn.style.display = state === 'admin' ? 'inline-block' : 'none';
  if (logoutBtn) logoutBtn.style.display = state === 'guest' ? 'none' : 'inline-block';
}

async function refreshAdminState(user) {
  if (!user) {
    isAdmin = false;
    setAdminUi('guest');
    return;
  }
  try {
    const snapshot = await get(ref(db, `admins/${user.uid}`));
    isAdmin = snapshot.exists();
  } catch (e) {
    isAdmin = false;
    console.warn('Nie udało się sprawdzić uprawnień administratora:', e.message);
  }
  setAdminUi(isAdmin ? 'admin' : 'user');
  if (isAdmin) {
    clearNotice('auth');
  } else {
    showNotice('To konto nie ma uprawnień administratora tego planu.', 'auth', true);
  }
}

// --- Zdarzenia -------------------------------------------------------------
function setupEvents() {
  // Podswietlanie przedmiotow: mysz/dotyk oraz klawiatura (Enter/Spacja).
  // Znaczniki sprawdzianow/zmian maja pierwszenstwo - otwieraja dymek.
  document.addEventListener('click', e => {
    const pin = e.target.closest('[data-tip-day]');
    if (pin) {
      e.preventDefault();
      openTip(Number(pin.dataset.tipDay), Number(pin.dataset.tipSlot));
      return;
    }
    const t = e.target.closest('.tile,.lesson-info');
    if (t) toggleSubjectHighlight(t);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeTip();
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target?.closest?.('[data-tip-day]')) return;
    const t = e.target && e.target.closest ? e.target.closest('.tile,.lesson-info') : null;
    if (!t) return;
    e.preventDefault();
    toggleSubjectHighlight(t);
  });

  // Dymek ze szczegolami sprawdzianu/zmiany (wspolny dla desktopu i telefonu)
  const tipOverlay = document.getElementById('tipOverlay');
  if (tipOverlay) {
    document.getElementById('tipClose')?.addEventListener('click', closeTip);
    tipOverlay.addEventListener('click', e => { if (e.target === tipOverlay) closeTip(); });
  }

  // Przełączanie motywu
  const themeBtn = document.getElementById('themeToggle');
  if (localStorage.getItem(THEME_KEY) === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.textContent = '☀️ Tryb jasny';
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.textContent = isDark ? '☀️ Tryb jasny' : '🌙 Tryb ciemny';
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  });

  // Logowanie administratora (Firebase Authentication: e-mail + haslo)
  const loginOverlay = document.getElementById('loginOverlay');
  const emailInput = document.getElementById('adminEmailInput');
  const passInput = document.getElementById('adminPasswordInput');
  const loginError = document.getElementById('loginError');
  const btnDoLogin = document.getElementById('btnDoLogin');

  const showLoginError = (message) => {
    loginError.textContent = message;
    loginError.style.display = 'block';
  };
  const closeLogin = () => loginOverlay.classList.remove('open');

  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    passInput.value = '';
    loginError.style.display = 'none';
    loginOverlay.classList.add('open');
    setTimeout(() => (emailInput.value ? passInput : emailInput).focus(), 100);
  });
  document.getElementById('btnLoginCancel').addEventListener('click', closeLogin);
  loginOverlay.addEventListener('click', e => { if (e.target === loginOverlay) closeLogin(); });
  emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') passInput.focus(); });
  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnDoLogin.click(); });

  btnDoLogin.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email || !password) {
      showLoginError('Podaj e-mail i hasło.');
      return;
    }
    btnDoLogin.disabled = true;
    loginError.style.display = 'none';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      passInput.value = '';
      closeLogin();
    } catch (err) {
      showLoginError(authErrorMessage(err.code));
      passInput.value = '';
      passInput.focus();
    } finally {
      btnDoLogin.disabled = false;
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Błąd wylogowania:', e.message);
    }
    isAdmin = false;
    setAdminUi('guest');
    clearNotice('auth');
  });

  // Modal edycji planu
  const editOverlay = document.getElementById('editOverlay');
  const saveStatus = document.getElementById('saveStatus');
  const btnSave = document.getElementById('btnSave');

  const closeEdit = () => editOverlay.classList.remove('open');
  document.getElementById('editClose').addEventListener('click', closeEdit);
  document.getElementById('btnCancel').addEventListener('click', closeEdit);
  editOverlay.addEventListener('click', e => { if (e.target === editOverlay) closeEdit(); });

  document.getElementById('editBtn').addEventListener('click', () => {
    if (!isAdmin) return;
    buildEditForm();
    saveStatus.className = 'save-status';
    saveStatus.textContent = '';
    saveStatus.style.display = 'none';
    btnSave.disabled = false;
    btnSave.textContent = '💾 Zapisz';
    editOverlay.classList.add('open');
  });

  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    btnSave.textContent = '⏳ Zapisuję...';
    try {
      const updated = collectForm();
      await saveData(updated);
      daysData = updated;
      renderDesktop();
      renderMobile();
      updateStatus();
      saveStatus.className = 'save-status ok';
      saveStatus.textContent = '✅ Zapisano!';
      saveStatus.style.display = 'flex';
      setTimeout(closeEdit, 1200);
    } catch (err) {
      console.warn('Błąd zapisu planu:', err.code || err.message);
      saveStatus.className = 'save-status err';
      saveStatus.textContent = saveErrorMessage(err.code);
      saveStatus.style.display = 'flex';
      btnSave.disabled = false;
      btnSave.textContent = '💾 Zapisz';
    }
  });
}

function buildEditForm() {
  const tabs = document.getElementById('editTabs');
  const panels = document.getElementById('editDayPanels');
  tabs.innerHTML = '';
  panels.innerHTML = '';

  daysData.forEach((day, di) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `edit-tab-btn${di === 0 ? ' active' : ''}`;
    tab.textContent = day.name;
    tab.onclick = () => {
      document.querySelectorAll('.edit-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.edit-day-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`ep-${di}`).classList.add('active');
    };
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.className = `edit-day-panel${di === 0 ? ' active' : ''}`;
    panel.id = `ep-${di}`;

    day.lessons.forEach((l, li) => {
      const isEmpty = !l || l.empty;
      const currentName = isEmpty ? '' : (l.name || '');
      const known = SUBJECT_OPTIONS.some(opt => String(opt).toLowerCase() === currentName.toLowerCase());
      // Wartosc spoza listy przedmiotow dopisujemy do selecta, zeby zapis nie
      // zamienil jej na placeholder (cicha utrata danych).
      const options = subjectOptionsFor(SUBJECT_OPTIONS, currentName);
      const extraIndex = known ? -1 : options.length - 1;

      let optionsHtml = `<option value="" ${isEmpty ? 'selected' : ''} disabled>-- wybierz przedmiot --</option>`;
      optionsHtml += options.map((opt, idx) => {
        const selected = !isEmpty && opt.toLowerCase() === currentName.toLowerCase();
        const label = idx === extraIndex ? `${opt} (spoza listy)` : opt;
        return `<option value="${esc(opt)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
      }).join('');

      const row = document.createElement('div');
      row.className = `edit-lesson-row${isEmpty ? ' is-empty' : ''}`;
      row.dataset.di = di;
      row.dataset.li = li;
      row.innerHTML = `
        <div>${esc(TIMES[li].num)}</div>
        <div class="icon-preview">${isEmpty ? EMPTY_ICON : esc(SUBJECT_MAP[currentName.toLowerCase()] || FALLBACK_ICON)}</div>
        <select class="es" ${isEmpty ? 'disabled' : ''}>${optionsHtml}</select>
        <input type="text" class="er" placeholder="Sala" maxlength="${LIMITS.ROOM}" ${isEmpty ? 'disabled' : ''}>
        <button type="button" class="empty-toggle${isEmpty ? ' toggled' : ''}" aria-label="Pusta lekcja">${EMPTY_ICON}</button>`;

      // Bezpieczne przypisanie wartości sali (unika XSS przez innerHTML)
      row.querySelector('.er').value = isEmpty ? '' : (l.room || '');

      const selectEl = row.querySelector('.es');
      const iconPreviewEl = row.querySelector('.icon-preview');
      const emptyToggleBtn = row.querySelector('.empty-toggle');
      const roomInput = row.querySelector('.er');

      selectEl.onchange = () => { iconPreviewEl.textContent = SUBJECT_MAP[selectEl.value] || FALLBACK_ICON; };
      emptyToggleBtn.onclick = () => {
        const now = emptyToggleBtn.classList.toggle('toggled');
        row.classList.toggle('is-empty', now);
        selectEl.disabled = now;
        roomInput.disabled = now;
        if (now) {
          iconPreviewEl.textContent = EMPTY_ICON;
        } else {
          if (!selectEl.value && selectEl.options.length > 1) {
            selectEl.selectedIndex = 1;
          }
          iconPreviewEl.textContent = SUBJECT_MAP[selectEl.value] || FALLBACK_ICON;
        }
      };

      panel.appendChild(row);
    });
    panels.appendChild(panel);
  });
}

function collectForm() {
  const nd = daysData.map(d => ({ ...d, lessons: d.lessons.map(l => ({ ...l })) }));
  document.querySelectorAll('.edit-lesson-row').forEach(row => {
    const di = +row.dataset.di;
    const li = +row.dataset.li;
    const empty = row.querySelector('.empty-toggle').classList.contains('toggled');
    if (empty) {
      nd[di].lessons[li] = { empty: true };
      return;
    }
    // normalizeLesson pilnuje limitow dlugosci zgodnych z database.rules.json
    nd[di].lessons[li] = normalizeLesson({
      name: row.querySelector('.es').value,
      room: row.querySelector('.er').value
    }, SUBJECT_MAP);
  });
  return nd;
}

document.addEventListener('DOMContentLoaded', () => {
  applyClassBranding();
  // app.js wystartowal - wylaczamy awaryjny licznik z boot-fallback.js
  if (typeof window.planReady === 'function') window.planReady();
  setupEvents();
  initSchedule();
  initSchool();
  onAuthStateChanged(auth, refreshAdminState);
  setInterval(updateStatus, 10000);
});







