# Architektura TASA Monitor

Aplikacja statyczna (Vite + React + TypeScript), bez serwera. Dane trafiają do przeglądarki przez wymienny transport, są parsowane do ramek, przetwarzane w warstwie domenowej i wyświetlane w panelach. Rekordy prób są zapisywane w IndexedDB.

```
 Transport (Web Serial | Web Bluetooth | WebSocket | Symulator)
        │  tekst (fragmenty linii)
        ▼
 LineSplitter ── linie ──► parser kotwicy (JSON)   parser stacji (t, stan, x, F + rozszerzenia)
                                   │                          │
                                   ▼                          ▼
                     AnchorModel (stan, IMU, łącze,   StationModel (etap, F(x), I/O,
                     detektor zdarzenia)              alarmy, analiza naciągu)
                                   │                          │
                                   └──────────► store ◄───────┘
                                                  │
                    panele: Stan kotwicy, Aktywacja, Stacja uzbrajania, Rejestr prób, Połączenia
                                                  │
                                       IndexedDB (rekordy prób), eksport CSV/JSON
```

## Struktura katalogów

```
docs/                    protokół, architektura, scenariusze testowe
public/                  logotypy (TASA wektorowo, TASA_A)
src/
  config/tasa.ts         wszystkie stałe sprzętowe i progi; "do potwierdzenia" przy wartościach niepodanych w pracy
  protocol/
    lineSplitter.ts      składanie linii z fragmentów (BLE dzieli linie na powiadomienia)
    anchorFrames.ts      typy i parser ramek modułu kotwicy
    stationFrames.ts     parser wierszy sterownika stacji
  transport/
    Transport.ts         interfejs wspólny
    webSerial.ts         Web Serial API
    webBluetooth.ts      Web Bluetooth, Nordic UART Service (XIAO ESP32-S3)
    webSocket.ts         WebSocket
    simulator.ts         transport podłączony do symulatora
  sim/
    rng.ts               generator pseudolosowy z ziarnem (powtarzalne przebiegi)
    stationSim.ts        model stacji: płyta, sprężyny, zaczepy, czujnik siły, sekwencja etapów 0–8
    stationScenarios.ts  scenariusze T1–T7 z oczekiwanym wynikiem
    anchorSim.ts         model modułu: zrzut, szczyt IMU, obrót tarczy, zwolnienie popychaczy
  domain/
    stats.ts             średnia, odchylenie standardowe, prosta MNK
    anchorState.ts       wyznaczanie stanu kotwicy z czujników
    activation.ts        detekcja zdarzenia, okno danych, obliczenia rozrzutu
    stationAnalysis.ts   analiza naciągu: nachylenie, siła szczytowa, siła resztkowa, rozpoznanie cyklu
    alarms.ts            kody alarmów i opisy po polsku
  store/                 stan aplikacji (zustand), modele źródeł, rejestr prób (IndexedDB)
  export/                CSV (format PL i międzynarodowy) i JSON
  ui/                    komponenty i panele
```

## Zasady

1. Stan wyświetlany pochodzi z odebranych ramek. Gdy ramka jest starsza niż 500 ms, wartość jest oznaczona jako nieaktualna, a przyciski poleceń stacji są zablokowane.
2. Czasy zdarzeń kotwicy pochodzą z mikrokontrolera (`t_us`). Czas przeglądarki służy tylko do pomiaru wieku ostatniej ramki.
3. Aplikacja wysyła wyłącznie polecenia z listy sterownika. Blokady bezpieczeństwa realizuje sterownik i sprzęt.
4. Symulator jest podłączony jak sprzęt: generuje te same linie tekstowe, które przechodzą przez parsery. Dzięki temu tryb symulacji sprawdza całą ścieżkę danych.
5. Stałe niepodane w pracy są w jednym pliku `src/config/tasa.ts` z komentarzem "do potwierdzenia".

## Przepływ danych przy zdarzeniu wyzwolenia

1. Ramki kotwicy trafiają do bufora kołowego (domyślnie 10 s czasu mikrokontrolera).
2. Zbocze `disk` 0 → 1 otwiera rejestrację: aplikacja kopiuje ramki z okresu `pre` przed zboczem i zbiera ramki do `post` po zboczu oraz porcje okna `window`.
3. Po zamknięciu okna (czas mikrokontrolera lub limit czasu oczekiwania na porcje) liczone są wyniki i zapisywany jest rekord próby typu "zrzut".

## Rozpoznawanie cyklu uzbrajania

Rekord próby otwiera wyjście z etapu 0 lub 6 do etapu roboczego (1–5, 7, 8). Przejście 6 → 8 (polecenie DISCHARGE na uzbrojonej kotwicy) zamyka rekord uzbrojenia i otwiera rekord rozładowania. Rekord zamyka się, gdy:

- etap wraca do 0 (przerwanie z alarmem, koniec rozładowania),
- etap 6 trwa bez ruchu płyty przez `ARM_RECORD_SETTLE_S` (uzbrojona, płyta w S1),
- płyta stoi 30 s z aktywnym alarmem (zatrzymanie, np. SENSOR/OVERLOAD),
- użytkownik zmienia scenariusz symulacji albo rozłącza źródło.

Rekord zawiera wiersze LOG, alarmy, impulsy Y3 (z wierszy IO) oraz dla każdej próby naciągu: dopasowanie prostej F(x) metodą najmniejszych kwadratów (z pominięciem początku i ostatnich 1,5 mm skoku), siłę szczytową, skok i siłę resztkową. Oczekiwane nachylenie w ponowionej próbie aplikacja szacuje z siły resztkowej poprzedniej próby (ok. 210 N na niezatrzaśnięty zaczep) i oznacza je jako szacunek.

## Ocena scenariuszy w trybie symulacji

Panel stacji porównuje wynik z oczekiwanym, gdy wykonano wszystkie kroki operatora, płyta poruszyła się po ostatnim poleceniu i stoi od 1,5 s. Porównanie korzysta wyłącznie z odebranych wierszy (etap, alarmy, impulsy Y3, S1, M1), a nie ze stanu wewnętrznego symulatora.
