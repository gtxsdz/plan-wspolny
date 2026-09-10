import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, get, set } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { CLASS_CONFIG } from './config.js';

// --- Dane z konfiguracji wybranej klasy ---
const app = initializeApp(CLASS_CONFIG.firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Logowanie anonimowe - potrzebne, by reguły bazy pozwoliły na zapis (write: auth != null).
// Jest w pełni niewidoczne dla użytkownika (dzieje się automatycznie przy starcie).
async function ensureAuth() {
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
  } catch (e) {
    console.warn('Nie udało się zalogować anonimowo:', e.message);
  }
}
const SUBJECT_MAP = CLASS_CONFIG.subjectMap;
const SUBJECT_OPTIONS = CLASS_CONFIG.subjectOptions;
const TIMES = CLASS_CONFIG.times;
const DEFAULT_LESSONS = CLASS_CONFIG.defaultLessons;

const DEFAULT_ADMIN_HASH = '9b9819c6a8980b8f602b4ce44561545564acfe44fd5ff6623bedf2f31de277e9';
let currentAdminHash = DEFAULT_ADMIN_HASH;

const DAY_META = [
  { dayNum: 1, mobileClass: 'day-pon', colClass: 'col-pon', name: 'Poniedziałek', shortName: 'Pon' },
  { dayNum: 2, mobileClass: 'day-wt',  colClass: 'col-wt',  name: 'Wtorek',      shortName: 'Wt'  },
  { dayNum: 3, mobileClass: 'day-sr',  colClass: 'col-sr',  name: 'Środa',       shortName: 'Śr'  },
  { dayNum: 4, mobileClass: 'day-czw', colClass: 'col-czw', name: 'Czwartek',    shortName: 'Czw' },
  { dayNum: 5, mobileClass: 'day-pt',  colClass: 'col-pt',  name: 'Piątek',      shortName: 'Pt'  }
];

let daysData = DAY_META.map((m, i) => ({ ...m, lessons: DEFAULT_LESSONS[i].map(l => ({ ...l })) }));
let isAdmin = false;
let activeSubject = null;

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
      art.innerHTML = CLASS_CONFIG.artSvg;
      art.style.display = '';
    } else {
      art.style.display = 'none';
    }
  }
  // Naglowek gotowy - odslaniamy (byl ukryty, by nie migac placeholderem)
  const header = document.getElementById('pageHeader');
  if (header) header.classList.remove('header-loading');
}

async function sha256(msg) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadData() {
  try {
    const snap = await get(ref(db, 'schedule/days'));
    if (snap.exists()) {
      const fb = snap.val();
      daysData = DAY_META.map((m, i) => ({
        ...m,
        // Merge per-slot: braki w bazie uzupełniamy domyślnym planem
        lessons: (fb[i] && fb[i].lessons)
          ? DEFAULT_LESSONS[i].map((def, li) =>
              (fb[i].lessons[li] !== undefined) ? fb[i].lessons[li] : def
            )
          : DEFAULT_LESSONS[i].map(l => ({ ...l }))
      }));
    }
    const hashSnap = await get(ref(db, 'adminHash'));
    if (hashSnap.exists()) {
      currentAdminHash = hashSnap.val();
    }
  } catch (e) {
    console.warn('Błąd pobierania z Firebase:', e.message);
  }
  renderDesktop();
  renderMobile();
  updateStatus();
}

async function saveData(data) {
  await ensureAuth();
  daysData = data;
  await set(ref(db, 'schedule/days'), data.map(d => ({ lessons: d.lessons })));
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

// Zwraca zakres godzinowy dnia (od startu 1. lekcji do konca ostatniej), np. "8:00–13:35".
// Liczony dynamicznie z faktycznych lekcji - pomija puste sloty na poczatku i koncu dnia.
// Dla dnia bez lekcji zwraca pusty string.
function dayTimeRange(day) {
  const idx = day.lessons
    .map((l, i) => ({ l, i }))
    .filter(x => x.l && !x.l.empty)
    .map(x => x.i);
  if (!idx.length) return '';
  const first = TIMES[idx[0]];
  const last = TIMES[idx[idx.length - 1]];
  const start = first.dTime.split('–')[0];
  const end = last.dTime.split('–')[1];
  return `${start}–${end}`;
}

function renderDesktopHead() {
  const thead = document.getElementById('desktopThead');
  if (!thead) return;
  const tr = document.createElement('tr');
  tr.innerHTML = '<th class="timo">Godz.</th>';
  daysData.forEach(day => {
    const range = dayTimeRange(day);
    const th = document.createElement('th');
    th.innerHTML = `<span class="dh-name">${day.name}</span>${range ? `<span class="dh-time">${range}</span>` : ''}`;
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
    tr.innerHTML = `<td class="nr"><span class="num"><span class="bell">🔔</span><span class="no">${slot.num}</span><span class="time">${slot.time}</span></span></td>`;
    daysData.forEach(day => {
      const td = document.createElement('td');
      td.className = `cell ${day.colClass}`;
      const l = day.lessons[li];
      if (!l || l.empty) {
        td.innerHTML = `<div class="tile empty"><span class="txt"><span class="p">&mdash;</span></span></div>`;
      } else {
        td.innerHTML = `<div class="tile" data-subject="${l.name.toLowerCase().trim()}"><span class="ico">${l.icon}</span><span class="txt"><span class="p">${l.name}</span><span class="s">${l.room}</span></span></div>`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderMobile() {
  const wrap = document.getElementById('mobileSchedule');
  wrap.innerHTML = '';
  daysData.forEach(day => {
    const card = document.createElement('div');
    card.className = `day-card ${day.mobileClass}`;
    card.dataset.day = day.dayNum;
    const range = dayTimeRange(day);
    card.innerHTML = `<div class="day-header">${day.name}${range ? `<span class="dh-time">${range}</span>` : ''}</div>`;
    const lc = document.createElement('div');
    lc.className = 'lessons-container';
    day.lessons.forEach((l, li) => {
      if (!l || l.empty) return;
      const t = TIMES[li];
      const row = document.createElement('div');
      row.className = 'lesson-row';
      row.dataset.lessonIndex = li;
      const info = document.createElement('div');
      info.className = 'lesson-info';
      info.dataset.subject = l.name.toLowerCase().trim();
      info.innerHTML = `<div class="lesson-content"><span class="lesson-icon">${l.icon}</span><div class="lesson-name">${l.name}</div><div class="lesson-room">${l.room}</div></div>`;
      row.innerHTML = `<div class="lesson-time"><span class="bell">🔔</span><span class="no">${t.num}</span><span class="time">${t.dTime}</span></div>`;
      row.appendChild(info);
      lc.appendChild(row);
    });
    card.appendChild(lc);
    wrap.appendChild(card);
  });
  renderTabs();
}

function renderTabs() {
  const { day, mins } = getWarsawTime();
  const today = daysData.find(d => d.dayNum === day);
  const activeLessons = today ? today.lessons.map((l, i) => ({ l, i })).filter(x => x.l && !x.l.empty) : [];
  const lastEnd = activeLessons.length ? TIMES[activeLessons[activeLessons.length - 1].i].e : 840;
  let init = (day < 1 || day > 5) ? 1 : (mins > lastEnd ? (day < 5 ? day + 1 : 1) : day);
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

// Pomocnik: dodaje klasę i data-badge do kafelka desktop i mobile dla danego slotu
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
  document.querySelectorAll('.active-lesson, .next-lesson').forEach(e => {
    e.classList.remove('active-lesson', 'next-lesson');
    e.removeAttribute('data-badge');
  });

  const { day, mins } = getWarsawTime();

  if (day < 1 || day > 5) {
    applyHighlight();
    return;
  }
  const today = daysData.find(d => d.dayNum === day);
  if (!today) return;

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
    const minsLeft = TIMES[li].e - mins;
    markLesson(li, day, 'active-lesson', `🔴 TERAZ (${minsLeft} min)`);
  } else if (isBreak && ni !== -1) {
    const minsLeft = TIMES[ni].s - mins;
    markLesson(ni, day, 'next-lesson', `⏳ za ${minsLeft} min`);
  }
  applyHighlight();
}

function applyHighlight() {
  document.querySelectorAll('.tile,.lesson-info').forEach(t => {
    const empty = t.classList.contains('empty') || !!t.querySelector('.lesson-empty');
    if (!activeSubject) {
      t.classList.remove('dimmed', 'highlighted');
      return;
    }
    if (!empty && t.dataset.subject === activeSubject) {
      t.classList.add('highlighted');
      t.classList.remove('dimmed');
    } else {
      t.classList.add('dimmed');
      t.classList.remove('highlighted');
    }
  });
}

function setupPasswordChangeUI() {
  let passBtn = document.getElementById('changePassBtn');
  if (!passBtn) {
    passBtn = document.createElement('button');
    passBtn.id = 'changePassBtn';
    passBtn.className = 'change-pass-btn';
    passBtn.textContent = '🔑 Zmień hasło';
    const editBtn = document.getElementById('editBtn');
    if (editBtn && editBtn.parentNode) {
      editBtn.parentNode.insertBefore(passBtn, editBtn.nextSibling);
    }
  }

  let passOverlay = document.getElementById('changePassOverlay');
  if (!passOverlay) {
    passOverlay = document.createElement('div');
    passOverlay.id = 'changePassOverlay';
    passOverlay.className = 'login-overlay';
    passOverlay.innerHTML = `
      <div class="login-box">
        <h3>🔑 Zmiana hasła admina</h3>
        <div class="login-error" id="passError"></div>
        <input type="password" id="newPassInput" placeholder="Nowe hasło" style="margin-bottom:10px;">
        <input type="password" id="confirmPassInput" placeholder="Powtórz nowe hasło" style="margin-bottom:14px;">
        <button type="button" class="btn-do-login" id="btnSavePass">💾 Zapisz nowe hasło</button>
        <button type="button" class="btn-login-cancel" id="btnCancelPass">Anuluj</button>
      </div>
    `;
    document.body.appendChild(passOverlay);
  }

  passBtn.addEventListener('click', () => {
    if (!isAdmin) return;
    document.getElementById('newPassInput').value = '';
    document.getElementById('confirmPassInput').value = '';
    const errEl = document.getElementById('passError');
    errEl.style.display = 'none';
    errEl.style.color = '#c0392b';
    passOverlay.classList.add('open');
  });

  document.getElementById('btnCancelPass').addEventListener('click', () => {
    passOverlay.classList.remove('open');
  });

  document.getElementById('btnSavePass').addEventListener('click', async () => {
    const p1 = document.getElementById('newPassInput').value.trim();
    const p2 = document.getElementById('confirmPassInput').value.trim();
    const errEl = document.getElementById('passError');

    if (!p1 || p1.length < 4) {
      errEl.textContent = 'Hasło musi mieć min. 4 znaki!';
      errEl.style.color = '#c0392b';
      errEl.style.display = 'block';
      return;
    }
    if (p1 !== p2) {
      errEl.textContent = 'Hasła nie są identyczne!';
      errEl.style.color = '#c0392b';
      errEl.style.display = 'block';
      return;
    }

    try {
      await ensureAuth();
      const newHash = await sha256(p1);
      await set(ref(db, 'adminHash'), newHash);
      currentAdminHash = newHash;
      errEl.style.color = '#2d6a4f';
      errEl.textContent = '✅ Hasło zostało zmienione!';
      errEl.style.display = 'block';
      setTimeout(() => {
        passOverlay.classList.remove('open');
      }, 1200);
    } catch (e) {
      errEl.style.color = '#c0392b';
      errEl.textContent = '⚠️ Błąd zapisu w bazie!';
      errEl.style.display = 'block';
    }
  });
}

function setupEvents() {
  // Podświetlanie przedmiotów
  document.addEventListener('click', e => {
    const t = e.target.closest('.tile,.lesson-info');
    if (!t || t.classList.contains('empty') || t.querySelector('.lesson-empty')) return;
    const s = t.dataset.subject;
    if (!s) return;
    activeSubject = activeSubject === s ? null : s;
    applyHighlight();
  });

  // Przełączanie motywu
  const themeBtn = document.getElementById('themeToggle');
  if (localStorage.getItem('schedule_theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.textContent = '☀️ Tryb jasny';
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.textContent = isDark ? '☀️ Tryb jasny' : '🌙 Tryb ciemny';
    localStorage.setItem('schedule_theme', isDark ? 'dark' : 'light');
  });

  setupPasswordChangeUI();

  // Logowanie
  const overlay = document.getElementById('loginOverlay');
  const input = document.getElementById('adminPasswordInput');
  const errMsg = document.getElementById('loginError');

  document.getElementById('adminLoginBtn').addEventListener('click', () => {
    input.value = '';
    errMsg.style.display = 'none';
    overlay.classList.add('open');
    setTimeout(() => input.focus(), 100);
  });

  document.getElementById('btnLoginCancel').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btnDoLogin').click(); });

  document.getElementById('btnDoLogin').addEventListener('click', async () => {
    if (await sha256(input.value) === currentAdminHash) {
      isAdmin = true;
      overlay.classList.remove('open');
      document.getElementById('adminLoginBtn').style.display = 'none';
      document.getElementById('editBtn').style.display = 'inline-block';
      document.getElementById('changePassBtn').style.display = 'inline-block';
      document.getElementById('adminLogoutBtn').style.display = 'inline-block';
    } else {
      errMsg.style.display = 'block';
      input.value = '';
      input.focus();
    }
  });

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    isAdmin = false;
    document.getElementById('adminLoginBtn').style.display = '';
    document.getElementById('editBtn').style.display = 'none';
    document.getElementById('changePassBtn').style.display = 'none';
    document.getElementById('adminLogoutBtn').style.display = 'none';
  });

  // Modal Edycji
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
    saveStatus.style.display = 'none';
    btnSave.disabled = false;
    btnSave.textContent = '💾 Zapisz';
    editOverlay.classList.add('open');
  });

  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    btnSave.textContent = '⏳ Zapisuję...';
    try {
      await saveData(collectForm());
      renderDesktop();
      renderMobile();
      updateStatus();
      saveStatus.className = 'save-status ok';
      saveStatus.innerHTML = '✅ Zapisano!';
      saveStatus.style.display = 'flex';
      setTimeout(() => { closeEdit(); }, 1200);
    } catch (err) {
      saveStatus.className = 'save-status err';
      saveStatus.innerHTML = `⚠️ Błąd zapisu!`;
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

      let optionsHtml = `<option value="" ${isEmpty ? 'selected' : ''} disabled>-- wybierz przedmiot --</option>`;
      optionsHtml += SUBJECT_OPTIONS.map(opt => `<option value="${opt}" ${!isEmpty && opt === currentName.toLowerCase() ? 'selected' : ''}>${opt}</option>`).join('');

      const row = document.createElement('div');
      row.className = `edit-lesson-row${isEmpty ? ' is-empty' : ''}`;
      row.dataset.di = di;
      row.dataset.li = li;
      row.innerHTML = `
        <div>${TIMES[li].num}</div>
        <div class="icon-preview">${isEmpty ? '🚫' : (SUBJECT_MAP[currentName.toLowerCase()] || '📖')}</div>
        <select class="es" ${isEmpty ? 'disabled' : ''}>${optionsHtml}</select>
        <input type="text" class="er" placeholder="Sala" ${isEmpty ? 'disabled' : ''}>
        <button type="button" class="empty-toggle${isEmpty ? ' toggled' : ''}">🚫</button>`;

      // Bezpieczne przypisanie wartości sali (unika XSS przez innerHTML)
      row.querySelector('.er').value = isEmpty ? '' : (l.room || '');

      const selectEl = row.querySelector('.es');
      const iconPreviewEl = row.querySelector('.icon-preview');
      const emptyToggleBtn = row.querySelector('.empty-toggle');
      const roomInput = row.querySelector('.er');

      selectEl.onchange = () => { iconPreviewEl.textContent = SUBJECT_MAP[selectEl.value] || '📖'; };
      emptyToggleBtn.onclick = () => {
        const now = emptyToggleBtn.classList.toggle('toggled');
        row.classList.toggle('is-empty', now);
        selectEl.disabled = now;
        roomInput.disabled = now;
        if (now) {
          iconPreviewEl.textContent = '🚫';
        } else {
          if (!selectEl.value && selectEl.options.length > 1) {
            selectEl.selectedIndex = 1;
          }
          iconPreviewEl.textContent = SUBJECT_MAP[selectEl.value] || '📖';
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
    const subjName = row.querySelector('.es').value.trim();
    nd[di].lessons[li] = empty ? { empty: true } : {
      icon: SUBJECT_MAP[subjName.toLowerCase()] || '📖',
      name: subjName || '—',
      room: row.querySelector('.er').value.trim() || '—'
    };
  });
  return nd;
}

document.addEventListener('DOMContentLoaded', async () => {
  applyClassBranding();
  ensureAuth();          // logowanie anonimowe w tle (nie blokuje renderu)
  await loadData();
  setupEvents();
  setInterval(updateStatus, 10000);
});
