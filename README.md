# Plan lekcji — wspólny projekt (5a + 4Ta)

Jeden zestaw kodu obsługujący plany lekcji dwóch klas. Rozróżnianie klasy następuje automatycznie po adresie:

| Adres | Klasa | Projekt Firebase | Baza (RTDB) |
|---|---|---|---|
| plan5a.web.app | 5a | plan-e5ce7 | plan-e5ce7-default |
| plan4ta.web.app | 4Ta | plan4ta | plan4ta-default |

Lokalnie / na innym adresie można wymusić klasę parametrem: `index.html?klasa=5a` lub `index.html?klasa=4ta` (domyślnie: 5a).

## Struktura

| Plik | Rola |
|---|---|
| `config.js` | jedyne miejsce z danymi per klasa: konfiguracja Firebase, godziny lekcji, mapy przedmiotów, domyślny plan, nazwa klasy i wychowawca. `resolveActiveClass()` wybiera klasę po adresie |
| `app.js` | wspólna logika: render (desktop + mobile), edytor, motyw, odliczanie w komórkach, logowanie administratora |
| `lib/plan-utils.js` | czyste funkcje (escapowanie HTML, scalanie z bazą, zakres godzin, komunikaty błędów) — pokryte testami |
| `index.html` | wspólny szkielet; tytuł, nagłówek i wychowawca ustawiane dynamicznie |
| `styles.css` | wspólne style + zmienne motywu jasny/ciemny |
| `boot-fallback.js` | komunikat awaryjny, gdy `app.js` nie wystartuje (brak sieci, brak plików) |
| `vendor/firebase/10.12.2/` | lokalna kopia SDK Firebase (aplikacja nie zależy od CDN gstatic) |
| `database.rules.json` | reguły Realtime Database (wdrażane przez CI) |
| `tools/`, `tests/` | skrypty pomocnicze i testy — nie są publikowane na hosting |

## Bezpieczeństwo

- **Odczyt planu:** publiczny — `schedule` czyta każdy (plan jest informacją publiczną dla uczniów i rodziców).
- **Zapis planu:** wyłącznie zalogowany użytkownik z wpisem `admins/<uid>` w bazie danego projektu.
- **Hasło administratora** nie jest przechowywane ani w kodzie, ani w bazie — służy do tego Firebase Authentication (e-mail + hasło).
- Dane z bazy są escapowane przy wstawianiu do HTML (`esc()`), a pola lekcji zapisywane są z limitami długości zgodnymi z `.validate` w regułach.
- Nagłówki bezpieczeństwa (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) ustawia `firebase.json`.

### Konfiguracja administratora (jednorazowo, w konsoli Firebase)

1. **Authentication → Sign-in method** → włącz provider **Email/Password**.
2. **Authentication → Users → Add user** → utwórz konto administratora (e-mail + hasło).
3. Skopiuj `uid` tego użytkownika i w **Realtime Database → Data** dodaj wpis `admins/<uid>: true`.
4. Powtórz kroki 2–3 w projekcie drugiej klasy (możesz użyć tego samego konta lub osobnych).

Bez wpisu w `admins` konto może się zalogować, ale nie zapisze planu — przycisk „Edytuj plan” pozostanie ukryty, a użytkownik zobaczy komunikat o braku uprawnień.

### Migracja starych baz

Po wdrożeniu nowych reguł węzły `adminHash` i `daysData` nie są już używane ani dostępne z aplikacji. Usuń je w konsoli (**Realtime Database → Data**), aby pozbyć się starych danych — w tym skrótu hasła administratora.

### Weryfikacja

- `GET https://<baza>/.json` oraz `/adminHash.json` muszą zwracać `Permission denied`.
- `GET https://<baza>/schedule/days.json` ma zwracać plan (odczyt publiczny).
- Nagłówki hostingów: `curl -I https://plan5a.web.app/` → obecne `Content-Security-Policy`, `Cache-Control: no-cache`.
- `https://plan5a.web.app/database.rules.json` musi zwracać 404 (plik nie jest publikowany).

## Wdrożenie

Push do `main` uruchamia dwa workflowy GitHub Actions:

- `deploy-plan5a.yml` → projekt `plan-e5ce7` (hosting `plan5a.web.app` + reguły bazy),
- `deploy-plan4ta.yml` → projekt `plan4ta` (hosting `plan4ta.web.app` + reguły bazy).

Każdy workflow przed publikacją uruchamia `npm run check` i `npm test`, a krok „Wdrożenie reguł Realtime Database” wykonuje `firebase deploy --only database`. Jeśli sekret service account nie istnieje, krok reguł jest pomijany (hosting nadal się wdroży).

Ręcznie (uwaga: `--only hosting` bez targetu próbuje wdrożyć oba targety i kończy się błędem, bo każdy projekt ma tylko jeden):

```bash
firebase deploy --only database --project plan-e5ce7
firebase deploy --only hosting:plan5a --project plan-e5ce7
firebase deploy --only database --project plan4ta
firebase deploy --only hosting:plan4ta --project plan4ta
```

## Praca lokalna

```bash
npm run check             # kontrola składni plików JS
npm test                  # testy jednostkowe + testy niezmienników reguł (node --test)
npm run vendor:firebase   # aktualizacja lokalnej kopii SDK Firebase (+ MANIFEST.json z SHA-256)
python -m http.server 8080   # podgląd: http://localhost:8080/index.html?klasa=5a
```

Testy reguł w emulatorze Realtime Database (wymagają zainstalowanej Javy):

```bash
firebase emulators:exec --only database "npm test"
```

## Modyfikacje

- **Logika / wygląd (dotyczy obu klas):** `app.js`, `styles.css`, `index.html`.
- **Dane jednej klasy (godziny, przedmioty, domyślny plan):** odpowiednia sekcja w `config.js` (`CLASS_5A` lub `CLASS_4TA`).
- **Limit długości pola lekcji:** `LIMITS` w `lib/plan-utils.js` **oraz** `.validate` w `database.rules.json` — zmieniaj w obu miejscach (`npm test` pilnuje spójności).
- **Nowa wersja SDK Firebase:** podnieś wersję w `tools/vendor-firebase.mjs` i uruchom `npm run vendor:firebase`.

## Znane ograniczenia

- Obie klasy mają osobne bazy i osobne projekty, ale dzielą jeden `config.js` — bundle na każdym hostingu zawiera konfigurację obu klas oraz wspólny kod. Klucze web Firebase nie są sekretem, natomiast gdybyś chciał całkowitej separacji danych, trzeba rozdzielić `config.js` na dwa pliki i dodać krok budujący wybrany plik per hosting.
- Zapis planu następuje per dzień; przy równoczesnej edycji tego samego dnia przez dwie osoby wygrywa ostatni zapis (aplikacja ostrzega o zmianie po jej pobraniu przez `onValue`).
- Ekran mobilny i tabela desktopowa są renderowane oba jednocześnie (widoczność rozstrzyga CSS) — świadoma decyzja, aby wydruk A4 działał także z telefonu.
