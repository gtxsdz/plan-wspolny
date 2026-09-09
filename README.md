# Plan lekcji — wspólny projekt (5a + 4Ta)

Jeden zestaw kodu obsługujący plany lekcji dwóch klas. Rozróżnianie klasy
następuje **automatycznie po adresie**:

| Adres              | Klasa | Projekt Firebase | Baza (RTDB)            |
|--------------------|-------|------------------|------------------------|
| plan5a.web.app     | 5a    | `plan-e5ce7`     | `plan-e5ce7-default`   |
| plan4ta.web.app    | 4Ta   | `plan4ta`        | `plan4ta-default`      |

Lokalnie / na innym adresie można wymusić klasę parametrem:
`index.html?klasa=5a` lub `index.html?klasa=4ta` (domyślnie: 5a).

## Struktura

- `config.js` — **jedyne miejsce z danymi per klasa**: konfiguracja Firebase,
  godziny lekcji, mapy przedmiotów, domyślny plan, nazwa klasy i wychowawca.
  Funkcja `resolveActiveClass()` wybiera klasę po adresie.
- `app.js` — wspólna logika (render, edytor, motyw, odliczanie w komórkach).
  Importuje `CLASS_CONFIG` z `config.js`.
- `index.html` — wspólny szkielet; tytuł/nagłówek/wychowawca ustawiane dynamicznie.
- `styles.css` — wspólne style.

## Dane i bazy

Każda klasa ma **osobną bazę Firebase Realtime Database** (w osobnych projektach
Google). Aplikacja łączy się z właściwą bazą na podstawie wybranej klasy — dane
klas pozostają całkowicie rozdzielone.

## Deploy

Push do gałęzi `main` uruchamia dwa workflowy GitHub Actions:

- `deploy-plan5a.yml` → publikuje na projekt `plan-e5ce7` (plan5a.web.app)
- `deploy-plan4ta.yml` → publikuje na projekt `plan4ta` (plan4ta.web.app)

Ten sam kod trafia na oba hostingi; klasa jest wybierana w przeglądarce po adresie.

## Modyfikacje

- **Zmiana logiki/wyglądu** (dotyczy obu klas): edytuj `app.js` / `styles.css` / `index.html`.
- **Zmiana danych jednej klasy** (godziny, przedmioty, domyślny plan): edytuj
  odpowiednią sekcję w `config.js` (`CLASS_5A` lub `CLASS_4TA`).
