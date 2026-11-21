# TASA Monitor

Aplikacja webowa do monitorowania stanu, działania i aktywacji kotwicy TASA (Tensegrity Automatic System for Anchoring, nazwa robocza Tensinigryt) oraz stacji uzbrajania. Dotyczy demonstratora i stanowiska badawczego; wersja lotna kotwicy nie ma elektroniki.

Dwa źródła danych:

- moduł pomiarowy kotwicy (STM32, IMU, 12 czujników Halla, czujnik tarczy) połączony przez Bluetooth LE z XIAO ESP32-S3,
- sterownik stacji uzbrajania (STM32 Nucleo-F446RE) przez USB-serial, w istniejącym formacie `t, stan, x, F`.

Aplikacja jest statyczną stroną (Vite + React + TypeScript) bez serwera. Rekordy prób są przechowywane w przeglądarce (IndexedDB).

## Uruchomienie

Plik `index.html` w katalogu głównym jest plikiem źródłowym: otwarty bezpośrednio w przeglądarce pokazuje tylko komunikat z instrukcją. Aplikację uruchamia się na jeden z trzech sposobów:

- serwer deweloperski (`npm run dev`),
- zbudowany plik `dist/index.html` (`npm run build`), który zawiera skrypt, style i czcionki i otwiera się dwuklikiem w Chrome lub Edge, także bez internetu,
- GitHub Pages (opis niżej).

Wymagany Node.js 20 lub nowszy (sprawdzone na 22).

```bash
npm install
```

```bash
npm run dev
```

Strona działa pod adresem http://localhost:5173. Web Serial i Web Bluetooth wymagają Chrome lub Edge oraz adresu `localhost` albo `https`.

```bash
npm run build
```

Wynik to jeden plik `dist/index.html` (ok. 640 kB). Można go otworzyć z dysku albo serwować dowolnym serwerem plików, np.:

```bash
npm run preview
```

### GitHub Pages

Workflow `.github/workflows/pages.yml` buduje i publikuje stronę po każdym pushu na `main` (lub ręcznie z zakładki Actions). Jednorazowo trzeba włączyć Pages: Settings → Pages → Source: GitHub Actions. Strona będzie pod adresem `https://<użytkownik>.github.io/TASA/`. Web Serial i Web Bluetooth działają na tej stronie, bo jest serwowana przez https.

Testy jednostkowe (Vitest):

```bash
npm test
```

## Tryb symulacji

Sprzęt jeszcze nie działa, więc każde źródło można połączyć z symulatorem. Symulator wysyła te same linie tekstowe co sprzęt, a aplikacja przetwarza je tym samym parserem.

1. W panelu "Stan kotwicy" kliknij "Połącz z symulatorem" (moduł kotwicy), w panelu "Stacja uzbrajania" tak samo (sterownik stacji). Nagłówek pokazuje oznaczenie "Symulacja".
2. W panelu "Połączenia" ustaw tempo czasu symulacji (1×, 5×, 20×, 50×). Pełny cykl uzbrajania trwa ok. 63 s czasu symulacji.
3. Stacja: wybierz scenariusz T1–T7 w ramce "Scenariusz symulacji" i wykonaj kroki operatora (START, RESET, DISCHARGE) przyciskami w panelu poleceń. Zdarzenia środowiska (otwarcie osłony, usterka czujnika) wykonuje symulator. Po zatrzymaniu płyty ramka pokazuje porównanie wyniku z oczekiwanym.
4. Kotwica: w panelu "Aktywacja" ustaw parametry zrzutu (wysokość, rozrzut zadany, opóźnienie kontakt → tarcza, czas skoku, przechył, zablokowany popychacz) i kliknij "Zrzut". Po zrzucie kotwicę trzeba ponownie uzbroić przyciskiem "Uzbrój kotwicę ponownie".
5. Test utraty łączności: w panelu "Połączenia" zaznacz "Przerwij łącze". Po 500 ms bez ramki pojawia się komunikat, a przyciski poleceń stacji są zablokowane.

| Scenariusz | Opis | Oczekiwany wynik |
|---|---|---|
| T1 | uzbrajanie bez usterek | etap 6, brak alarmu, nachylenie ok. 25,6 N/mm, siła resztkowa < 20 N |
| T2 | brak jednej sprężyny | alarm SPRING_SLOPE (nachylenie ok. 21,3 N/mm), płyta w S1 |
| T3 | trwale niezatrzaśnięty zaczep | siła resztkowa ok. 210 N, 2 próby, rozładowanie jednym impulsem Y3, alarm ARM_FAILED |
| T4 | przejściowa usterka zaczepu | uzbrojona w 2. próbie |
| T5 | otwarcie osłony w trakcie naciągu | alarm DOOR, napęd zatrzymany, RESET prowadzi do bazowania |
| T6 | utrata czujnika siły i przeciążenie | alarmy SENSOR i OVERLOAD, napęd zatrzymany |
| T7 | rozładowanie na rozkaz | jeden impuls Y3, etap 0, brak alarmu |

Scenariusze pochodzą z Tab. 33 pracy. Parametry modelu symulatora (opóźnienia siłowników, położenie S2 względem oparcia, droga kontroli nachylenia, szczyt przyspieszenia przy kontakcie) są założeniami symulatora i są opisane w `src/sim/`.

## Podłączenie stacji uzbrajania przez USB

1. Podłącz Nucleo-F446RE kablem USB (port ST-LINK). Płytka udostępnia wirtualny port szeregowy.
2. Na Linuksie użytkownik musi mieć prawo dostępu do portu (zwykle grupa `dialout`).
3. W panelu "Połączenia" wybierz "USB (Web Serial)" dla sterownika stacji i kliknij "Połącz", a następnie wskaż port w oknie przeglądarki.
4. Prędkość portu: 115200 b/s (do potwierdzenia, `STATION_SERIAL_BAUD` w `src/config/tasa.ts`).
5. Sterownik powinien pracować w trybie LOG i wysyłać wiersz co 20 ms. Brak wiersza dłużej niż 500 ms blokuje przyciski poleceń.

Aplikacja wysyła wyłącznie polecenia z listy sterownika: `START`, `DISCHARGE`, `RESET`, `STATUS`, `ZERO`, `CAL <siła>`. START i DISCHARGE wymagają potwierdzenia w oknie z bieżącym stanem S3–S6. Blokady (osłona S6, STOP, przekaźnik K1, warunki zwolnienia Y3) realizują sterownik i sprzęt; aplikacja nie ma poleceń omijających blokady ani trybu sterowania wyjściami.

## Podłączenie modułu kotwicy przez Bluetooth

Moduł udostępnia profil Nordic UART Service na XIAO ESP32-S3 (usługa `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, nazwa urządzenia z prefiksem `TASA`, do potwierdzenia). W panelu "Połączenia" wybierz "Bluetooth LE (XIAO ESP32-S3)" i wskaż urządzenie. Na Linuksie Web Bluetooth wymaga włączenia flagi w przeglądarce. Ten sam format linii działa przez USB (XIAO USB CDC) i WebSocket (mostek radiowy lub przyszły mostek Python).

## Format ramek

Pełny opis: [docs/protokol.md](docs/protokol.md).

Moduł kotwicy wysyła jeden obiekt JSON w linii. Znaczniki czasu `t_us` nadaje mikrokontroler; rozrzut chwil zwolnienia i opóźnienia aplikacja liczy wyłącznie z tych znaczników, nie z czasu odbioru ramek.

```json
{"type":"telemetry","seq":1042,"t_us":20845123,"acc":[0.012,-0.034,0.998],"hs":63,"he":0,"disk":0,"pin":1}
{"type":"event","seq":1043,"t_us":20845991,"src":"hall","ch":3,"pos":"start","val":0}
{"type":"status","seq":1100,"t_us":21000000,"vbat":3.87,"rssi":-62,"fw":"0.1.0","err":0,"cap":1}
{"type":"window","seq":1201,"t_us":21500000,"id":7,"ch":"az","t0_us":20795120,"dt_us":100,"n":2000,"i":0,"v":[1.01,0.99]}
```

Sterownik stacji wysyła istniejące wiersze LOG bez zmian w firmware:

```
t, stan, x, F
12340, 4, 201.35, 512.7
```

Wiersze dodatkowe są opcjonalne: `IO S1=1 ... Y3=0` (lampki), `STATUS stan=6 ... alarm=NONE`, `ALARM <KOD>`, `OK/ERR <polecenie>`. Kod alarmu jest rozpoznawany w dowolnym wierszu tekstowym. Bez wierszy IO lampki pokazują "brak", a aplikacja nie odtwarza stanu wejść z numeru etapu.

## Panele

- Stan kotwicy: stan logiczny (ROZBROJONA, UZBROJONA, UZBROJONA Z ZAWLECZKĄ, WYZWOLONA, NIEPEŁNE WYZWOLENIE oraz BRAK DANYCH i NIEOKREŚLONY), widok z góry z 6 rurami i 12 czujnikami Halla, przyspieszenie osiowe na żywo, przechył z alarmem przy 28,8°, akumulator, RSSI, wiek ostatniej ramki.
- Aktywacja: automatyczna rejestracja po obrocie tarczy (okno ramek przed i po zdarzeniu oraz okno szybkie z modułu), oś czasu kontakt → tarcza → START/KONIEC P1–P6, opóźnienie kontakt → tarcza, rozrzut max−min, odchylenie standardowe, czasy skoku i prędkości, oznaczenie popychaczy bez KONIEC.
- Stacja uzbrajania: diagram GRAFCET 0–8 z etapem aktywnym, wykres F(x) z charakterystyką oczekiwaną, pasem ±10% i liniami 20 N i 1600 N, lampki S1–S6, STOP, START, M1, Y1–Y3, lista alarmów z opisem po polsku, polecenia.
- Rejestr prób: rekord każdego cyklu uzbrajania, rozładowania i zrzutu z parametrami (badanie, wysokość, uwagi) i wynikami; eksport CSV i JSON.
- Połączenia: wybór transportu dla każdego źródła, ustawienia symulacji.

## Rejestr prób i eksport

- CSV podsumowania: jeden wiersz na próbę, kolumny zdefiniowane w `src/export/summaryColumns.ts`.
- CSV próby: komplet danych jednej próby w sekcjach (metadane, wyniki, próby naciągu, alarmy, wiersze LOG albo popychacze, zdarzenia, telemetria i okno szybkie).
- JSON: pełny rekord próby lub wszystkich prób.
- Format CSV "PL" (średnik, przecinek dziesiętny, znacznik BOM UTF-8) otwiera się w arkuszu z polskimi ustawieniami regionalnymi; format "międzynarodowy" używa przecinka i kropki.

W repozytorium nie ma pliku `Karta_Pomiarowa_Tensinigryt.xlsx`, więc kolumny podsumowania ułożono według programu badań (Tab. 34 pracy: B3, B3a, B3c, B10, B11). Po dodaniu pliku karty wystarczy dopasować etykiety i kolejność w `src/export/summaryColumns.ts`.

## Konfiguracja

Wszystkie stałe sprzętowe i progi są w `src/config/tasa.ts`. Wartości niepodane w pracy mają komentarz "do potwierdzenia", m.in.:

- prędkości portów szeregowych i zakończenie linii poleceń,
- jednostka pola `t` w wierszu LOG (domyślnie wykrywana automatycznie: ms lub s),
- format polecenia `CAL`,
- częstotliwość telemetrii (50 Hz) i okna szybkiego (10 kHz), długości okien,
- odległość punktów przełączania czujników Halla (nominalnie 50 mm),
- progi akumulatora i RSSI, prefiks nazwy BLE.

## Struktura projektu

```
docs/            protokół ramek i architektura
src/config/      stałe sprzętowe (tasa.ts)
src/protocol/    składanie linii, parsery ramek kotwicy i stacji
src/transport/   Web Serial, Web Bluetooth (NUS), WebSocket, symulator
src/sim/         symulatory stacji (T1–T7) i modułu kotwicy
src/domain/      stan kotwicy, statystyki i MNK, rejestracja zdarzenia, analiza naciągu, model stacji
src/store/       stan aplikacji, rejestr prób (IndexedDB)
src/export/      CSV i JSON
src/ui/          komponenty i panele
tests/           testy Vitest
```

## Testy

49 testów jednostkowych obejmuje parsery (w tym niepoprawne ramki), wyznaczanie stanu kotwicy, statystyki i dopasowanie prostej MNK, składanie okien, obliczenia rozrzutu, przebieg symulatora kotwicy przez parser i rejestrator (rozrzut zgodny z zadanym z dokładnością do 0,5 µs), scenariusze T1–T7 przez pełną ścieżkę symulator → parser → model stacji oraz eksport CSV.

## Logotypy

`TASA.jfif` zwektoryzowano (potrace) do `src/assets/tasa-wordmark.svg`; nagłówek używa go jako maski, więc logo zmienia kolor w trybie ciemnym. `TASA_A.svg` jest ikoną strony (wbudowaną w `index.html`) i interaktywnym komponentem `src/ui/components/TasaMark.tsx`: najechanie skręca górny trójkąt pryzmatu tensegrity, kliknięcie odtwarza wyzwolenie (pręty układają się w gwiazdę zgodną z kierunkami sześciu grotów, groty wystrzeliwują, struktura wraca z tłumionymi drganiami). Przy ustawieniu "ogranicz ruch" animacja jest wyłączona.

## Licencja

MIT, patrz `LICENSE`.
