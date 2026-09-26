# Bezpieczeństwo

## Zgłaszanie problemów

Jeśli znajdziesz lukę w tym projekcie (np. możliwość zapisu planu bez uprawnień, wyciek danych, XSS), zgłoś ją prywatnie właścicielowi repozytorium — nie publikuj szczegółów w issues, dopóki problem nie zostanie naprawiony.

## Model dostępu

| Zasób | Odczyt | Zapis |
|---|---|---|
| `schedule` (plan lekcji) | publiczny | tylko konto z wpisem `admins/<uid>` |
| `admins/<uid>` | tylko zalogowany właściciel wpisu | brak dostępu z klienta (zmiana w konsoli Firebase) |
| inne węzły (np. stare `adminHash`, `daysData`) | brak reguły = brak dostępu | brak reguły = brak dostępu |

Uwierzytelnianie: Firebase Authentication (provider Email/Password). Aplikacja nie używa już logowania anonimowego ani hasła przechowywanego w bazie/kodzie.

Kontrola dostępu jest realizowana po stronie serwera (reguły bazy w `database.rules.json`), a nie tylko przez ukrywanie przycisków w interfejsie.

## Co jest świadomie publiczne

- Klucze web Firebase (`apiKey`, `appId`, `messagingSenderId` itd.) w `config.js` — zgodnie z dokumentacją Firebase nie są sekretami. Ochronę zapewniają reguły bazy oraz ograniczenia klucza API.
- Plan lekcji obu klas — jest informacją publiczną.

## Zalecane ustawienia w konsoli (poza repozytorium)

1. **Authentication → Users:** trzymaj tylko konta administratorów; usuń konta, które nie są potrzebne.
2. **Google Cloud → APIs & Services → Credentials:** ogranicz klucz web do HTTP referrers: `https://plan5a.web.app/*`, `https://plan4ta.web.app/*` oraz `http://localhost:8080/*` (praca lokalna).
3. **App Check** (opcjonalnie): reCAPTCHA dla obu aplikacji — ogranicza nadużycia ruchu; nie zastępuje reguł autoryzacyjnych.
4. **Realtime Database → Rules:** upewnij się, że wdrożone reguły są zgodne z `database.rules.json` (CI wdraża je przy każdym pushu do `main`).
5. Usuń stare węzły `adminHash` i `daysData`.

## Zabezpieczenia w kodzie i CI

- `esc()` escapuje wszystkie dane z bazy przed wstawieniem do HTML (także w atrybutach) — ochrona przed stored XSS.
- `normalizeLesson()` przycina pola do `LIMITS`, a reguły bazy walidują długości (`.validate`).
- Nagłówki bezpieczeństwa dla obu hostingów (m.in. `Content-Security-Policy` z `script-src 'self'`) w `firebase.json`.
- Polityka CSP jest celowo ścisła dla skryptów, bo cały kod (w tym SDK Firebase) jest serwowany z tego samego hostingu. Uwagi na przyszłość:
  - logowanie Google (popup/redirect) wymaga dodania `https://apis.google.com` do `script-src` oraz `https://*.firebaseapp.com` do `frame-src` (to drugie już jest);
  - App Check z reCAPTCHA wymaga dopuszczenia skryptu reCAPTCHA w `script-src` i ewentualnie `frame-src https://www.google.com`;
  - `style-src` zawiera `'unsafe-inline'` z powodu atrybutu `style="display:none"` na linku do drugiego planu — po zamianie na klasę CSS można tę dyrektywę zaostrzyć.
- SDK Firebase jest serwowany lokalnie z `vendor/`, więc CSP nie musi dopuszczać zewnętrznego CDN.
- `npm test` zawiera testy niezmienników reguł: brak otwartego zapisu (`auth != null`), brak hasha hasła w bazie, spójność limitów pól z regułami.
- Workflowy używają minimalnych uprawnień (`permissions: contents: read`) i akcji przypiętych do commitów.
