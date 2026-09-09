// ============================================================================
//  KONFIGURACJA KLAS - wspólny projekt planu lekcji
//  Rozróżnianie klasy następuje automatycznie po adresie (hostname):
//    plan5a.web.app  -> klasa 5a
//    plan4ta.web.app -> klasa 4Ta
//  Lokalnie / na innym adresie można wymusić parametrem ?klasa=5a lub ?klasa=4ta
// ============================================================================

// --- Definicja klasy 5a --------------------------------------------------
const CLASS_5A = {
  id: '5a',
  title: 'Plan Lekcji Klasy 5a',
  heading: 'PLAN LEKCJI KLASY 5a',
  teacher: 'Wychowawca: mgr Monika Olejniczak',
  showArt: true,
  // Ozdobniki dla klasy podstawowej: kolorowe kredki, gwiazdki, jabłko, chmurki - w rogach arkusza
  artSvg: `
    <g transform="translate(14,10) rotate(-32)">
      <rect x="0" y="0" width="120" height="14" rx="3" fill="#ff6b6b"/><polygon points="120,0 138,7 120,14" fill="#ffd36b"/><polygon points="131,3.5 138,7 131,10.5" fill="#5a3d1e"/>
      <rect x="0" y="18" width="120" height="14" rx="3" fill="#4ea1ff"/><polygon points="120,18 138,25 120,32" fill="#ffd36b"/><polygon points="131,21.5 138,25 131,28.5" fill="#5a3d1e"/>
      <rect x="0" y="36" width="120" height="14" rx="3" fill="#5ac77a"/><polygon points="120,36 138,43 120,50" fill="#ffd36b"/><polygon points="131,39.5 138,43 131,46.5" fill="#5a3d1e"/>
    </g>
    <g transform="translate(1090,60)" fill="#ffcf3f" stroke="#e6a417" stroke-width="2" stroke-linejoin="round">
      <polygon points="40,0 50,28 80,28 55,46 65,76 40,58 15,76 25,46 0,28 30,28"/>
    </g>
    <g transform="translate(1040,690)">
      <circle cx="30" cy="30" r="26" fill="#ff7a7a"/><path d="M30 8 q6 -10 14 -4 q-6 2 -8 8" fill="#5ac77a"/><ellipse cx="22" cy="24" rx="5" ry="7" fill="#fff" opacity=".5"/>
    </g>
    <g transform="translate(70,700)" fill="#ffffff" stroke="#cde3f5" stroke-width="2">
      <ellipse cx="34" cy="34" rx="34" ry="20"/><ellipse cx="60" cy="30" rx="26" ry="18"/>
    </g>
    <g transform="translate(560,4)" fill="#ffb84d"><circle cx="0" cy="0" r="6"/><circle cx="26" cy="10" r="4"/><circle cx="-24" cy="9" r="4"/></g>`,
  firebaseConfig: {
    apiKey: "AIzaSyAcf3E50EtPo1kUWs2ybUT8mWzVtWqlSqY",
    authDomain: "plan-e5ce7.firebaseapp.com",
    databaseURL: "https://plan-e5ce7-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "plan-e5ce7",
    storageBucket: "plan-e5ce7.firebasestorage.app",
    messagingSenderId: "756360816596",
    appId: "1:756360816596:web:0fb318d682b0af88fcd841",
    measurementId: "G-K3W393N2PF"
  },
  subjectMap: {
    'matematyka': '🔬', 'j. polski': '📚', 'j. ang': '🌐', 'j. angielski': '🌐',
    'historia': '🏛️', 'geografia': '🌍', 'biologia': '🧪', 'przyroda': '🌿',
    'informatyka': '💻', 'technika': '⚙️', 'plastyka': '🎨', 'muzyka': '🎵',
    'wf': '🏃', 'basen': '🏊', 'religia': '🙏', 'etyka': '🕊️', 'zaj. z wych.': '💬',
    'godz. wych.': '💬', 'edu. zdrow.': '❤️'
  },
  subjectOptions: [
    'matematyka', 'j. polski', 'j. ang', 'historia', 'geografia', 'biologia',
    'przyroda', 'informatyka', 'technika', 'plastyka', 'muzyka', 'wf', 'basen',
    'religia', 'zaj. z wych.', 'edu. zdrow.'
  ],
  times: [
    { num: '1', time: '8.00–8.45',   dTime: '8:00–8:45',   s: 480, e: 525 },
    { num: '2', time: '8.55–9.40',   dTime: '8:55–9:40',   s: 535, e: 580 },
    { num: '3', time: '9.50–10.35',  dTime: '9:50–10:35',  s: 590, e: 635 },
    { num: '4', time: '10.45–11.30', dTime: '10:45–11:30', s: 645, e: 690 },
    { num: '5', time: '11.45–12.30', dTime: '11:45–12:30', s: 705, e: 750 },
    { num: '6', time: '12.50–13.35', dTime: '12:50–13:35', s: 770, e: 815 }
  ],
  defaultLessons: [
    [{ icon: '🔬', name: 'matematyka', room: '243' }, { icon: '📚', name: 'j. polski', room: '125' }, { icon: '📚', name: 'j. polski', room: '125' }, { icon: '⚙️', name: 'technika', room: '103' }, { icon: '🏃', name: 'wf', room: 's. gimn.' }, { empty: true }],
    [{ empty: true }, { icon: '💬', name: 'zaj. z wych.', room: '243' }, { icon: '🌐', name: 'j. ang', room: '131' }, { icon: '📚', name: 'j. polski', room: '125' }, { icon: '🎨', name: 'plastyka', room: '125' }, { icon: '❤️', name: 'edu. zdrow.', room: '125' }],
    [{ icon: '🔬', name: 'matematyka', room: '243' }, { icon: '🏃', name: 'wf', room: 's. gimn.' }, { icon: '🧪', name: 'biologia', room: '203' }, { icon: '🏛️', name: 'historia', room: '221' }, { icon: '🌐', name: 'j. ang', room: '131' }, { icon: '💻', name: 'informatyka', room: '103' }],
    [{ icon: '📚', name: 'j. polski', room: '125' }, { icon: '🌍', name: 'geografia', room: '203' }, { icon: '🔬', name: 'matematyka', room: '243' }, { icon: '🏊', name: 'basen', room: 'pływ.' }, { icon: '🏛️', name: 'historia', room: '221' }, { empty: true }],
    [{ icon: '🔬', name: 'matematyka', room: '243' }, { icon: '📚', name: 'j. polski', room: '125' }, { icon: '🏃', name: 'wf', room: 's. gimn.' }, { icon: '🌐', name: 'j. ang', room: '203' }, { icon: '🎵', name: 'muzyka', room: '50' }, { icon: '🙏', name: 'religia', room: '141' }]
  ]
};

// --- Definicja klasy 4Ta -------------------------------------------------
const CLASS_4TA = {
  id: '4ta',
  title: 'Plan lekcji klasy 4Ta',
  heading: 'PLAN LEKCJI KLASY 4Ta',
  teacher: 'Wychowawca: mgr Dorota Łajs',
  showArt: true,
  // Ozdobniki dla technikum (profil architektoniczny): ekierka, cyrkiel, linijka, ołówek techniczny
  artSvg: `
    <g transform="translate(20,14) rotate(-6)" fill="none" stroke="#5a3d1e" stroke-width="3" stroke-linejoin="round">
      <polygon points="0,0 132,0 0,96" fill="#e3c481" fill-opacity=".55"/>
      <line x1="16" y1="0" x2="16" y2="12"/><line x1="34" y1="0" x2="34" y2="12"/><line x1="52" y1="0" x2="52" y2="12"/><line x1="70" y1="0" x2="70" y2="12"/><line x1="88" y1="0" x2="88" y2="12"/><line x1="106" y1="0" x2="106" y2="12"/>
    </g>
    <g transform="translate(1085,40)" stroke="#5a3d1e" stroke-width="4" stroke-linecap="round" fill="none">
      <circle cx="30" cy="8" r="6" fill="#c9a55f"/><line x1="30" y1="14" x2="8" y2="78"/><line x1="30" y1="14" x2="52" y2="78"/><line x1="26" y1="52" x2="34" y2="52"/><polygon points="4,78 12,78 8,90" fill="#5a3d1e" stroke="none"/>
    </g>
    <g transform="translate(950,700) rotate(20)">
      <rect x="0" y="0" width="150" height="26" rx="2" fill="#f0dcae" stroke="#c9a55f" stroke-width="2"/>
      <g stroke="#8a6c40" stroke-width="2"><line x1="18" y1="0" x2="18" y2="10"/><line x1="36" y1="0" x2="36" y2="14"/><line x1="54" y1="0" x2="54" y2="10"/><line x1="72" y1="0" x2="72" y2="14"/><line x1="90" y1="0" x2="90" y2="10"/><line x1="108" y1="0" x2="108" y2="14"/><line x1="126" y1="0" x2="126" y2="10"/></g>
    </g>
    <g transform="translate(40,690) rotate(-28)">
      <rect x="0" y="0" width="150" height="16" rx="2" fill="#ffcf3f"/><rect x="0" y="0" width="24" height="16" fill="#d98b3a"/><polygon points="150,0 172,8 150,16" fill="#f4c07a"/><polygon points="165,4.5 172,8 165,11.5" fill="#3a2a12"/>
    </g>`,
  firebaseConfig: {
    // Firebase Web API key - not a secret, required client-side for Firebase SDK
    apiKey: "AIzaSyDJkIBARaAn0Q9SOyoM46nfUk2GIocHDPU", // gitleaks:allow
    authDomain: "plan4ta.firebaseapp.com",
    databaseURL: "https://plan4ta-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "plan4ta",
    storageBucket: "plan4ta.firebasestorage.app",
    messagingSenderId: "192603551045",
    appId: "1:192603551045:web:e878dc6328aee16a393a2c",
    measurementId: "G-CJ9F46CJC1"
  },
  subjectMap: {
    'matematyka': '🔢', 'j. polski': '📚', 'j. angielski': '🌐', 'j. ang': '🌐',
    'historia': '🏛️', 'geografia': '🌍', 'biologia': '🧪', 'r_biologia': '🔬',
    'r_matematyka': '📐', 'fizyka': '⚛️', 'chemia': '🧫',
    'wf': '🏃', 'religia': '🙏', 'zaj. z wychowawcą': '💬',
    'ob. małej arch.': '🏗️', 'proj. ob. arch.': '📐', 'prace w ob. arch.': '🔧',
    'j. ang. w arch.': '🌿', 'j. niemiecki': '🇩🇪'
  },
  subjectOptions: [
    'matematyka', 'r_matematyka', 'j. polski', 'j. angielski',
    'j. ang. w arch.', 'j. niemiecki', 'historia', 'geografia',
    'biologia', 'r_biologia', 'fizyka', 'chemia', 'wf', 'religia',
    'zaj. z wychowawcą', 'ob. małej arch.', 'proj. ob. arch.', 'prace w ob. arch.'
  ],
  times: [
    { num: '1',  time: '8.00–8.45',   dTime: '8:00–8:45',    s: 480, e: 525 },
    { num: '2',  time: '8.50–9.35',   dTime: '8:50–9:35',    s: 530, e: 575 },
    { num: '3',  time: '9.40–10.25',  dTime: '9:40–10:25',   s: 580, e: 625 },
    { num: '4',  time: '10.40–11.25', dTime: '10:40–11:25',  s: 640, e: 685 },
    { num: '5',  time: '11.30–12.15', dTime: '11:30–12:15',  s: 690, e: 735 },
    { num: '6',  time: '12.20–13.05', dTime: '12:20–13:05',  s: 740, e: 785 },
    { num: '7',  time: '13.10–13.55', dTime: '13:10–13:55',  s: 790, e: 835 },
    { num: '8',  time: '14.10–14.55', dTime: '14:10–14:55',  s: 850, e: 895 },
    { num: '9',  time: '15.00–15.45', dTime: '15:00–15:45',  s: 900, e: 945 },
    { num: '10', time: '15.50–16.35', dTime: '15:50–16:35',  s: 950, e: 995 }
  ],
  defaultLessons: [
    // Poniedziałek
    [
      { empty: true }, { empty: true },
      { icon: '💬', name: 'zaj. z wychowawcą', room: '48'  },
      { icon: '🌍', name: 'geografia',         room: '48'  },
      { icon: '📚', name: 'j. polski',         room: '20'  },
      { icon: '🔢', name: 'matematyka',        room: '106' },
      { icon: '🔢', name: 'matematyka',        room: '106' },
      { icon: '🧪', name: 'biologia',          room: '48'  },
      { empty: true }, { empty: true }
    ],
    // Wtorek
    [
      { empty: true }, { empty: true }, { empty: true },
      { icon: '🌐', name: 'j. angielski',    room: '46'  },
      { icon: '🌐', name: 'j. angielski',    room: '46'  },
      { icon: '📐', name: 'proj. ob. arch.', room: 'IN8' },
      { icon: '🔢', name: 'matematyka',      room: '106' },
      { icon: '🏃', name: 'wf',              room: 'wf3' },
      { icon: '🏃', name: 'wf',              room: 'wf1' },
      { icon: '🇩🇪', name: 'j. niemiecki',    room: '47'  }
    ],
    // Środa
    [
      { icon: '📚', name: 'j. polski',        room: '20'  },
      { icon: '⚛️', name: 'fizyka',           room: '110' },
      { icon: '🏗️', name: 'ob. małej arch.', room: 'IN19' },
      { icon: '🏗️', name: 'ob. małej arch.', room: 'IN19' },
      { icon: '🏗️', name: 'ob. małej arch.', room: 'IN19' },
      { icon: '🏗️', name: 'ob. małej arch.', room: 'IN19' },
      { icon: '🏛️', name: 'historia',        room: '114' },
      { icon: '🔢', name: 'matematyka',       room: '106' },
      { icon: '🏃', name: 'wf',               room: 'wf4' },
      { empty: true }
    ],
    // Czwartek
    [
      { icon: '📚', name: 'j. polski',        room: '20'  },
      { icon: '🧪', name: 'biologia',         room: '48'  },
      { icon: '🏗️', name: 'ob. małej arch.', room: 'IN28' },
      { icon: '🧫', name: 'chemia',           room: 'IN19' },
      { icon: '📐', name: 'proj. ob. arch.',  room: 'IN28' },
      { icon: '📐', name: 'proj. ob. arch.',  room: 'IN28' },
      { icon: '🌐', name: 'j. angielski',     room: '46'  },
      { empty: true }, { empty: true }, { empty: true }
    ],
    // Piątek
    [
      { empty: true },
      { icon: '🌿', name: 'j. ang. w arch.',   room: 'IN37' },
      { icon: '🔧', name: 'prace w ob. arch.', room: 'IN19' },
      { icon: '🔧', name: 'prace w ob. arch.', room: 'IN19' },
      { icon: '🔧', name: 'prace w ob. arch.', room: 'IN19' },
      { icon: '🔧', name: 'prace w ob. arch.', room: 'IN19' },
      { empty: true }, { empty: true }, { empty: true }, { empty: true }
    ]
  ]
};

// --- Wybór aktywnej klasy ------------------------------------------------
function resolveActiveClass() {
  const params = new URLSearchParams(window.location.search);
  const forced = (params.get('klasa') || '').toLowerCase();
  if (forced === '5a') return CLASS_5A;
  if (forced === '4ta') return CLASS_4TA;

  const host = window.location.hostname.toLowerCase();
  if (host.includes('plan4ta')) return CLASS_4TA;
  if (host.includes('plan5a')) return CLASS_5A;

  // Domyślnie (np. localhost / nieznany adres) -> 5a
  return CLASS_5A;
}

export const CLASS_CONFIG = resolveActiveClass();
