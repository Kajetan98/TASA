/**
 * Stałe sprzętowe, progi i parametry TASA Monitor.
 *
 * Źródło wartości opisano przy każdej stałej:
 *  - "praca"            – wartość podana w pracy inżynierskiej (Tensinigryt/TASA) lub w zadaniu,
 *  - "do potwierdzenia" – wartość założona, której nie podano; wymaga sprawdzenia na sprzęcie
 *                         lub w firmware przed użyciem wyników.
 */

// ───────────────────────── Kotwica: geometria i stan ─────────────────────────

/** Liczba popychaczy (sprężyn, grotów). Praca. */
export const PUSHER_COUNT = 6;

/** Skok sprężyny / popychacza [mm]. Praca. */
export const SPRING_STROKE_MM = 50;

/**
 * Odległość punktów przełączania czujników START i KONIEC na listwie [mm],
 * używana do średniej prędkości popychacza. Nominalnie równa skokowi; rzeczywista
 * zależy od histerezy czujników Halla. Do potwierdzenia (pomiar na listwie).
 */
export const HALL_SWITCH_DISTANCE_MM = 50;

/** Energia jednej sprężyny [J]. Praca. */
export const SPRING_ENERGY_J = 6;

/** Kąt obrotu tarczy zwalniającej przy wyzwoleniu [°]. Praca. */
export const RELEASE_DISK_ANGLE_DEG = 25;

/** Kąt przewrócenia: alarm przechyłu po przyziemieniu [°]. Praca. */
export const TIP_OVER_ANGLE_DEG = 28.8;

/** Próg ostrzeżenia o przechyle, ułamek kąta przewrócenia. Do potwierdzenia. */
export const TILT_WARNING_FRACTION = 0.75;

/** Masa urządzenia [kg], zakres. Praca. */
export const ANCHOR_MASS_KG = { min: 2.0, max: 2.7 } as const;

/** Kąt pochylenia rur prowadzących względem osi ψ [°]. Praca (wariant bazowy 30°). */
export const GUIDE_TUBE_PSI_DEG = 30;

// ───────────────────────── Moduł pomiarowy kotwicy ─────────────────────────

/** Wersja protokołu modułu (docs/protokol.md). */
export const ANCHOR_PROTOCOL_VERSION = 1;

/** Nominalna częstotliwość ramek telemetry [Hz]. Do potwierdzenia. */
export const ANCHOR_TELEMETRY_HZ = 50;

/** Częstotliwość próbkowania okna szybkiej rejestracji [Hz]. Do potwierdzenia (typ IMU niewybrany). */
export const ANCHOR_WINDOW_HZ = 10_000;

/** Okno szybkiej rejestracji w module: przed / po zboczu tarczy [ms]. Do potwierdzenia. */
export const ANCHOR_WINDOW_PRE_MS = 50;
export const ANCHOR_WINDOW_POST_MS = 150;

/** Okno zapisu ramek w aplikacji wokół zdarzenia: przed / po obrocie tarczy [ms czasu µC]. Do potwierdzenia. */
export const ACTIVATION_PRE_MS = 1500;
export const ACTIVATION_POST_MS = 1500;

/** Limit oczekiwania na porcje okna `window` po zamknięciu okna ramek [ms czasu przeglądarki]. Do potwierdzenia. */
export const ACTIVATION_WINDOW_WAIT_MS = 4000;

/** Długość bufora kołowego ramek kotwicy [s czasu µC]. */
export const ANCHOR_BUFFER_S = 12;

/** Długość wykresu przyspieszenia na żywo [s]. */
export const ANCHOR_LIVE_CHART_S = 10;

/** Akumulator LiPo 1S: progi ostrzeżenia i alarmu [V]. Do potwierdzenia (typ ogniwa). */
export const VBAT_WARN_V = 3.6;
export const VBAT_CRITICAL_V = 3.4;
export const VBAT_FULL_V = 4.2;

/** RSSI: próg słabego sygnału [dBm]. Do potwierdzenia. */
export const RSSI_WEAK_DBM = -80;

/** Bluetooth LE: Nordic UART Service na XIAO ESP32-S3. UUID standardowe NUS; prefiks nazwy do potwierdzenia. */
export const BLE_NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const BLE_NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // zapis: aplikacja → moduł
export const BLE_NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // powiadomienia: moduł → aplikacja
export const BLE_NAME_PREFIX = 'TASA';
/** Największa porcja zapisu do charakterystyki RX [B]; 20 B działa przy domyślnym MTU 23. */
export const BLE_WRITE_CHUNK = 20;

/** Prędkość portu szeregowego modułu (USB CDC ignoruje tę wartość). Do potwierdzenia. */
export const ANCHOR_SERIAL_BAUD = 115_200;

// ───────────────────────── Stacja uzbrajania ─────────────────────────

/** Prędkość portu szeregowego Nucleo-F446RE (ST-LINK VCP). Do potwierdzenia. */
export const STATION_SERIAL_BAUD = 115_200;

/** Zakończenie linii polecenia. Do potwierdzenia. */
export const STATION_LINE_ENDING = '\n';

/** Okres wiersza LOG [ms]. Praca. */
export const STATION_LOG_PERIOD_MS = 20;

/**
 * Jednostka pola `t` w wierszu LOG. 'auto' wykrywa ją z mediany odstępów kolejnych wierszy
 * (odstęp > 1 → ms, w przeciwnym razie s). Do potwierdzenia w firmware.
 */
export const STATION_TIME_UNIT: 'auto' | 'ms' | 's' = 'auto';

/** Format polecenia kalibracji ze znaną siłą. Do potwierdzenia w firmware. */
export const formatCalCommand = (forceN: number): string => `CAL ${forceN.toFixed(1)}`;

/** Nachylenie charakterystyki F(x) przy 6 sprężynach [N/mm]. Praca. */
export const SLOPE_NOMINAL_N_PER_MM = 25.6;

/** Nachylenie przy braku jednej sprężyny [N/mm]. Praca (21,3 N/mm). */
export const SLOPE_FIVE_SPRINGS_N_PER_MM = 21.3;

/** Tolerancja nachylenia (±). Praca. */
export const SLOPE_TOLERANCE = 0.10;

/** Siła na płycie na początku naciągu (napięcie wstępne 6 × 40 N / cos ψ) [N]. Praca. */
export const PRELOAD_FORCE_N = 277;

/** Siła szczytowa na płycie [N]. Praca. */
export const PEAK_FORCE_N = 1386;

/** Droga naciągu płyty od oparcia do S2 [mm]. Praca. */
export const COCK_STROKE_MM = 43.3;

/** Próg przeciążenia [N]. Praca. */
export const OVERLOAD_FORCE_N = 1600;

/** Próg wykrycia oparcia prętów o groty (F_k) i próg siły resztkowej [N]. Praca. */
export const CONTACT_FORCE_N = 20;
export const RESIDUAL_FORCE_LIMIT_N = 20;

/** Siła resztkowa przy jednym niezatrzaśniętym zaczepie [N]. Praca (ok. 210 N). */
export const RESIDUAL_ONE_LATCH_N = 210;

/** Cofnięcie płyty przy pomiarze siły resztkowej [mm]. Praca. */
export const BACKOFF_MM = 5;

/** Prędkość naciągu [mm/s]. Praca. */
export const COCK_SPEED_MM_S = 3;

/** Prędkość dojazdu i powrotu [mm/s]. Praca (10 mm/s). */
export const FAST_SPEED_MM_S = 10;

/** Droga dojazdu płyty do grotów bez obciążenia [mm]. Praca (190 mm). */
export const APPROACH_MM = 190;

/** Nominalny czas cyklu uzbrajania [s]. Praca (63 s z symulacji programu). */
export const ARM_CYCLE_NOMINAL_S = 63;

/** Kryterium przyjęcia: cykl naciągu nie dłuższy niż [s]. Praca. */
export const ARM_CYCLE_LIMIT_S = 120;

/** Dopasowanie prostej F(x): pominięcie początku i końca naciągu [mm]. Początek do potwierdzenia, koniec 1,5 mm z pracy. */
export const FIT_SKIP_START_MM = 2;
export const FIT_END_MARGIN_MM = 1.5;

/** Rekord próby uzbrajania zamyka się, gdy etap 6 trwa bez ruchu płyty przez [s]. Do potwierdzenia. */
export const ARM_RECORD_SETTLE_S = 2;

/** Liczba prób naciągu przed rozładowaniem. Praca (2). */
export const MAX_COCK_ATTEMPTS = 2;

// ───────────────────────── Łączność ─────────────────────────

/** Brak ramki dłużej niż [ms] = utrata łączności, blokada poleceń. Wymaganie bezpieczeństwa. */
export const LINK_TIMEOUT_MS = 500;

/** Czas oczekiwania na odpowiedź STATUS przy otwarciu okna potwierdzenia [ms]. */
export const STATUS_REFRESH_WAIT_MS = 400;

// ───────────────────────── Etapy GRAFCET ─────────────────────────

export interface StageInfo {
  id: number;
  short: string;
  description: string;
}

/** Etapy sekwencji uzbrajania. Praca (Rys. 20, podrozdział 7.5). */
export const STAGES: readonly StageInfo[] = [
  { id: 0, short: 'Oczekiwanie', description: 'oczekiwanie, bazowanie płyty do S1' },
  { id: 1, short: 'Zacisk Y1', description: 'zacisk szczęk na pierścieniu dolnym' },
  { id: 2, short: 'Zawleczka Y2', description: 'wsunięcie zawleczki' },
  { id: 3, short: 'Dojazd', description: `dojazd szybki do oparcia (F > ${CONTACT_FORCE_N} N)` },
  { id: 4, short: 'Naciąg', description: `naciąg ${COCK_SPEED_MM_S} mm/s do S2, kontrola nachylenia F(x)` },
  { id: 5, short: 'Cofnięcie', description: `cofnięcie o ${BACKOFF_MM} mm, pomiar siły resztkowej` },
  { id: 6, short: 'Uzbrojona', description: `siła resztkowa < ${RESIDUAL_FORCE_LIMIT_N} N` },
  { id: 7, short: 'Ponowienie', description: 'powrót do S1 i ponowienie od etapu 3' },
  { id: 8, short: 'Rozładowanie', description: 'kontrolowane rozładowanie i alarm' },
];

export const stageInfo = (id: number): StageInfo =>
  STAGES.find((s) => s.id === id) ?? { id, short: `Etap ${id}`, description: 'etap spoza sekwencji 0–8' };
