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
  showArt: false,
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
