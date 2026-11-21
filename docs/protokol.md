# Protokół komunikacji TASA Monitor

Wersja protokołu modułu kotwicy: **1**. Dokument opisuje dwa źródła danych:

- A. moduł pomiarowy kotwicy (STM32 + IMU + 12 czujników Halla + czujnik tarczy, łączność Bluetooth LE przez XIAO ESP32-S3),
- B. sterownik stacji uzbrajania (STM32 Nucleo-F446RE, USB-serial, istniejący format `t, stan, x, F`).

Wartości oznaczone "do potwierdzenia" są zebrane w `src/config/tasa.ts`.

## A. Moduł pomiarowy kotwicy

### A.1 Warstwa transportowa

| Kanał | Parametry | Uwagi |
|---|---|---|
| Bluetooth LE (XIAO ESP32-S3) | Nordic UART Service: usługa `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`, TX moduł→aplikacja (notify) `6E400003-…`, RX aplikacja→moduł (write) `6E400002-…` | nazwa urządzenia z prefiksem `TASA` (do potwierdzenia); Web Bluetooth w Chrome/Edge |
| USB-serial | XIAO ESP32-S3 USB CDC albo UART STM32 przez konwerter, 115200 8N1 (do potwierdzenia) | ten sam format linii; przydatny przy uruchamianiu na stole |
| WebSocket | `ws://host:port`, jedna lub więcej linii w wiadomości tekstowej | mostek radiowy lub przyszły mostek Python |

XIAO ESP32-S3 może pracować jako przezroczysty mostek UART↔BLE dla STM32 albo jako jedyny mikrokontroler modułu (do potwierdzenia). Protokół jest w obu przypadkach ten sam. Znaczniki czasu `t_us` nadaje mikrokontroler, który odczytuje czujniki; mostek ich nie zmienia.

Zalecenia dla BLE:

- MTU: firmware powinien zgłosić MTU co najmniej 247 B. Aplikacja składa linie z kolejnych powiadomień, więc jedna linia może być podzielona na kilka powiadomień, a jedno powiadomienie może zawierać kilka linii.
- Interwał połączenia 7,5–15 ms. Przy telemetrii 50 Hz strumień wynosi ok. 6 kB/s.
- RSSI połączenia odczytuje moduł (na ESP32: `esp_ble_gap_read_rssi`) i wysyła w ramce `status`, bo Web Bluetooth nie udostępnia RSSI aktywnego połączenia.

### A.2 Format linii

- UTF-8, jeden obiekt JSON w linii, zakończenie `\n` (akceptowane `\r\n`).
- Maksymalna długość linii: 512 B.
- Pola wspólne każdej ramki:

| Pole | Typ | Znaczenie |
|---|---|---|
| `type` | tekst | `telemetry`, `event`, `status`, `window`, `hello`, `ack` |
| `seq` | uint32 | licznik ramek zwiększany o 1 przy każdej ramce; aplikacja wykrywa luki |
| `t_us` | liczba całkowita | czas mikrokontrolera w µs od startu, licznik 64-bitowy (rozszerzenie 32-bitowego timera licznikiem przepełnień); w ramce `event` jest to czas zbocza, nie czas wysłania |

Aplikacja ignoruje nieznane pola i nieznane typy ramek (zapisuje je w konsoli).

### A.3 Ramka `telemetry`

Wysyłana cyklicznie, domyślnie 50 Hz (do potwierdzenia), nie rzadziej niż 10 Hz. Brak jakiejkolwiek ramki przez ponad 500 ms aplikacja traktuje jako utratę łączności.

```json
{"type":"telemetry","seq":1042,"t_us":20845123,"acc":[0.012,-0.034,0.998],"tilt":2.1,"hs":63,"he":0,"disk":0,"pin":1}
```

| Pole | Jednostka | Znaczenie |
|---|---|---|
| `acc` | g | przyspieszenie `[x, y, z]`; `z` w osi urządzenia, zwrot od grotów do piasty (w spoczynku na podłożu `z ≈ +1 g`) |
| `tilt` | ° | opcjonalnie: przechył osi względem pionu wyznaczony w firmware (fuzja z żyroskopem); gdy brak, aplikacja liczy `acos(z/|a|)` i oznacza wynik jako przybliżenie statyczne |
| `hs` | maska bitowa | czujniki START: bit 0 = P1 … bit 5 = P6; 1 = magnes popychacza wykryty |
| `he` | maska bitowa | czujniki KONIEC, numeracja jak `hs` |
| `disk` | 0/1 | 0 = tarcza w położeniu zamkniętym (zaczepy zamknięte), 1 = tarcza obrócona (nominalnie 25°) |
| `pin` | 0/1, opcjonalne | zawleczka obecna (1) lub usunięta (0); pominąć, gdy moduł nie ma czujnika zawleczki |

### A.4 Ramka `event`

Wysyłana natychmiast po każdym zboczu. Czas zbocza rejestruje przerwanie lub przechwytywanie timera (input capture), a nie pętla główna.

```json
{"type":"event","seq":1043,"t_us":20845991,"src":"hall","ch":3,"pos":"start","val":0}
{"type":"event","seq":1044,"t_us":20845120,"src":"disk","val":1}
{"type":"event","seq":1045,"t_us":20837904,"src":"imu_peak","val":38.5}
{"type":"event","seq":1046,"t_us":20900000,"src":"pin","val":0}
```

| `src` | Pola | Znaczenie |
|---|---|---|
| `hall` | `ch` 1–6, `pos` `start`/`end`, `val` 0/1 | nowy stan czujnika Halla; zwolnienie popychacza Pn = zbocze `start` → 0, dojście do końca skoku = zbocze `end` → 1 |
| `disk` | `val` 0/1 | zmiana położenia tarczy; zbocze 0 → 1 uruchamia rejestrację zdarzenia w aplikacji |
| `imu_peak` | `val` [g] | opcjonalnie: szczyt przyspieszenia wykryty w firmware (kontakt z gruntem); `t_us` = chwila szczytu |
| `pin` | `val` 0/1 | zmiana stanu zawleczki (gdy jest czujnik) |

Kolejność wysyłania ramek `event` nie musi odpowiadać kolejności zboczy; aplikacja sortuje zdarzenia po `t_us`.

### A.5 Ramka `status`

Co 1 s oraz na polecenie `status`.

```json
{"type":"status","seq":1100,"t_us":21000000,"vbat":3.87,"rssi":-62,"fw":"0.1.0","err":0,"cap":1}
```

| Pole | Znaczenie |
|---|---|
| `vbat` | napięcie akumulatora LiPo [V] |
| `rssi` | siła sygnału połączenia BLE mierzona przez moduł [dBm] |
| `fw` | wersja firmware |
| `err` | maska błędów: bit 0 IMU, bit 1 czujniki Halla, bit 2 przepełnienie bufora, bit 3 czujnik tarczy |
| `cap` | 1 = rejestracja okna uzbrojona, 0 = okno w trakcie wysyłania lub rejestracja wyłączona |

### A.6 Ramka `window` (okno szybkiej rejestracji)

Moduł przechowuje w buforze kołowym próbki kanału szybkiego (domyślnie przyspieszenie osiowe, 10 kHz, do potwierdzenia). Po zboczu tarczy 0 → 1 zapisuje okno od `pre_ms` przed do `post_ms` po zboczu i wysyła je w porcjach.

```json
{"type":"window","seq":1201,"t_us":21500000,"id":7,"ch":"az","t0_us":20795120,"dt_us":100,"n":2000,"i":0,"v":[1.01,0.99,1.02]}
```

| Pole | Znaczenie |
|---|---|
| `id` | numer rejestracji, zwiększany przy każdym wyzwoleniu |
| `ch` | kanał: `az` przyspieszenie osiowe [g]; zarezerwowane `amag` moduł przyspieszenia [g], `F1`–`F3` siły w węzłach dolnych [N] (badanie B3b) |
| `t0_us` | czas mikrokontrolera próbki o indeksie 0; próbka `k` ma czas `t0_us + k·dt_us` |
| `dt_us` | okres próbkowania [µs] |
| `n` | całkowita liczba próbek okna |
| `i` | indeks pierwszej próbki w tej porcji |
| `v` | wartości próbek (do ok. 40 w porcji, aby linia nie przekroczyła 512 B) |

Okno jest kompletne, gdy aplikacja odbierze wszystkie `n` próbek. Okno niekompletne po upływie limitu czasu jest zapisywane z oznaczeniem braków.

### A.7 Ramka `hello` i `ack`

```json
{"type":"hello","seq":0,"t_us":15000,"dev":"TASA-MOD-01","fw":"0.1.0","proto":1,"tel_hz":50,"win_hz":10000,"pre_ms":50,"post_ms":150}
{"type":"ack","seq":17,"t_us":16000,"cmd":"rearm","ok":true}
```

`hello` jest wysyłana po nawiązaniu połączenia i na polecenie `hello`.

### A.8 Polecenia aplikacja → moduł

Jeden obiekt JSON w linii. Moduł nie ma elementów wykonawczych, więc polecenia nie wpływają na mechanizm kotwicy.

| Polecenie | Odpowiedź |
|---|---|
| `{"cmd":"hello"}` | ramka `hello` |
| `{"cmd":"status"}` | ramka `status` |
| `{"cmd":"rearm"}` | uzbrojenie rejestracji kolejnego okna, `ack` |
| `{"cmd":"ping","id":12}` | `{"type":"ack","cmd":"ping","id":12,...}` |

### A.9 Wyznaczanie stanu kotwicy w aplikacji

Stan wynika wyłącznie z ostatniej odebranej ramki `telemetry` (maski `hs`, `he`, pola `disk`, `pin`). Gdy ostatnia ramka jest starsza niż 500 ms, aplikacja pokazuje ostatni stan jako nieaktualny.

| Warunek | Stan |
|---|---|
| brak ramek | BRAK DANYCH |
| dowolny popychacz z aktywnym START i KONIEC jednocześnie | NIEOKREŚLONY (błąd czujnika) |
| `disk = 0`, wszystkie START = 1, `pin = 1` | UZBROJONA Z ZAWLECZKĄ |
| `disk = 0`, wszystkie START = 1, `pin = 0` lub brak pola `pin` | UZBROJONA (przy braku pola: "stan zawleczki nieznany") |
| `disk = 0`, wszystkie KONIEC = 1 | ROZBROJONA |
| `disk = 1`, wszystkie KONIEC = 1 | WYZWOLONA |
| `disk = 1`, nie wszystkie KONIEC = 1 | NIEPEŁNE WYZWOLENIE (z listą popychaczy) |
| `disk = 0`, pozostałe kombinacje | NIEOKREŚLONY (popychacze w położeniu pośrednim) |

Do potwierdzenia: czy tarcza po wyzwoleniu pozostaje obrócona. Jeżeli wraca do położenia zamkniętego, stan po wyzwoleniu będzie wyświetlany jako ROZBROJONA, a informację o wyzwoleniu zachowuje rekord zdarzenia w panelu "Aktywacja".

### A.10 Obliczenia zdarzenia wyzwolenia

Wszystkie czasy pochodzą z `t_us` mikrokontrolera. Czas odbioru ramek w przeglądarce nie jest używany do obliczeń.

- Kontakt z gruntem: chwila szczytu przyspieszenia. Źródło w kolejności: okno `window` (najwyższa rozdzielczość), zdarzenie `imu_peak`, telemetria (oznaczona jako niska rozdzielczość).
- Obrót tarczy: zbocze `disk` 0 → 1.
- Zwolnienie popychacza Pn: zbocze `start` → 0 kanału n.
- Koniec skoku Pn: zbocze `end` → 1 kanału n.
- Opóźnienie kontakt → tarcza: `t_tarcza − t_kontakt`.
- Rozrzut chwil zwolnienia: `max − min` chwil zwolnienia popychaczy, które opuściły START; odchylenie standardowe z próby (dzielnik n − 1).
- Czas skoku Pn: `t_koniec − t_zwolnienie`; średnia prędkość: odległość punktów przełączania czujników (nominalnie 50 mm, do potwierdzenia) / czas skoku.
- Popychacze bez zbocza `end` → 1 są oznaczane jako niedochodzące do KONIEC.

## B. Sterownik stacji uzbrajania

### B.1 Warstwa transportowa

USB-serial przez ST-LINK VCP płytki Nucleo-F446RE, 115200 8N1 (do potwierdzenia), Web Serial API w Chrome/Edge. Ten sam format można przesyłać przez WebSocket.

### B.2 Polecenia aplikacja → sterownik

Linie tekstowe zakończone `\n` (do potwierdzenia: `\n` lub `\r\n`):

| Polecenie | Działanie w sterowniku |
|---|---|
| `START` | rozpoczęcie cyklu uzbrajania |
| `DISCHARGE` | kontrolowane rozładowanie (etap 8) |
| `RESET` | kasowanie alarmu, bazowanie |
| `STATUS` | odczyt stanu |
| `ZERO` | tarowanie czujnika siły |
| `CAL <siła_N>` | kalibracja współczynnika N/licznik znaną siłą (format argumentu do potwierdzenia) |

Aplikacja nie ma poleceń omijających blokady ani sterujących wyjściami M1, Y1–Y3 bezpośrednio. Blokady realizują sterownik i sprzęt (S6, STOP, przekaźnik K1, warunki zwolnienia Y3).

### B.3 Wiersz LOG (istniejący format, bez zmian w firmware)

Co 20 ms:

```
t, stan, x, F
12340, 4, 201.35, 512.7
```

| Pole | Znaczenie |
|---|---|
| `t` | czas sterownika; jednostka wykrywana automatycznie z odstępu wierszy (ms lub s) albo ustawiona w konfiguracji |
| `stan` | numer etapu GRAFCET 0–8 |
| `x` | położenie płyty [mm] |
| `F` | siła na płycie [N]; `nan` lub puste pole = brak próbki |

Parser akceptuje separator `,` `;` lub tabulator ze spacjami, kropkę dziesiętną i pomija wiersz nagłówka.

### B.4 Wiersze dodatkowe (opcjonalne rozszerzenie firmware)

Format nie wymaga zmian w firmware: wiersze inne niż LOG są rozpoznawane, jeżeli zawierają poniższe elementy, a pozostałe trafiają do konsoli.

| Wiersz | Przykład | Użycie w aplikacji |
|---|---|---|
| alarm | `ALARM SPRING_SLOPE slope=21.31` | dowolny wiersz zawierający kod alarmu jako osobne słowo dodaje wpis do listy alarmów |
| kasowanie | `ALARM NONE` lub `ALARM CLEAR` | oznaczenie alarmów jako skasowanych przez sterownik |
| wejścia/wyjścia | `IO S1=1 S2=0 S3=1 S4=1 S5=1 S6=1 STOP=0 START=0 M1=0 Y1=1 Y2=1 Y3=0` | lampki; zalecane wysyłanie przy każdej zmianie i w odpowiedzi na `STATUS` |
| stan | `STATUS stan=6 S1=1 ... alarm=NONE` | jak `IO`, dodatkowo etap i aktywny alarm |
| potwierdzenie | `OK START`, `ERR START DOOR` | konsola |

Znaczenie logiczne: `1` oznacza stan aktywny czujnika (S6 = 1: osłona zamknięta, STOP = 1: wyłącznik zatrzymania wciśnięty), niezależnie od tego, czy obwód jest normalnie zamknięty.

Bez wierszy `IO`/`STATUS` lampki pokazują "brak danych"; aplikacja nie odtwarza stanu wejść z numeru etapu.

Kody alarmów: `SPRING_SLOPE`, `BAD_STROKE`, `SPRING_FORCE`, `ARM_FAILED`, `DOOR`, `SENSOR`, `OVERLOAD`, a także `NO_SUPPORT` (opisany w podrozdziale 7.10.6 pracy). Nieznany kod w wierszu `ALARM <KOD>` jest wyświetlany bez tłumaczenia.

### B.5 Utrata łączności

Brak wiersza ze sterownika dłużej niż 500 ms (tryb LOG wysyła wiersz co 20 ms) blokuje przyciski poleceń i wyświetla komunikat. Przyciski wracają po odebraniu kolejnego wiersza.
