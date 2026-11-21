import { PUSHER_COUNT } from '../config/tasa';
import type { SummaryValue, TrialRecord } from '../store/trials';
import { localDateTime } from './format';

/**
 * Kolumny podsumowania prób (karta pomiarowa). W repozytorium nie ma pliku
 * Karta_Pomiarowa_Tensinigryt.xlsx, więc kolumny ułożono według programu badań (Tab. 34 pracy):
 * B10 (cykl uzbrajania), B11 (rozładowanie), B3/B3a/B3c (zrzut). Po dodaniu pliku karty
 * należy dopasować etykiety i kolejność w tej tablicy; reszta eksportu z niej korzysta.
 */

export interface SummaryColumn {
  label: string;
  get: (t: TrialRecord) => SummaryValue;
  /** Kolumna metadanych (w eksporcie pojedynczej próby jest w sekcji nagłówka). */
  common?: boolean;
}

const s = (key: string) => (t: TrialRecord) => t.summary[key] ?? null;

export const SUMMARY_COLUMNS: SummaryColumn[] = [
  { label: 'Id próby', get: (t) => t.id, common: true },
  { label: 'Data i godzina', get: (t) => localDateTime(t.createdAt), common: true },
  { label: 'Rodzaj próby', get: (t) => t.kind, common: true },
  { label: 'Badanie', get: (t) => t.params.badanie, common: true },
  { label: 'Źródło danych', get: (t) => t.source, common: true },
  { label: 'Scenariusz / wariant', get: (t) => t.scenario, common: true },
  { label: 'Wynik', get: s('result') },
  { label: 'Czas cyklu [s]', get: s('cycleTimeS') },
  { label: 'Liczba prób naciągu', get: s('attempts') },
  { label: 'Nachylenie F(x) próba 1 [N/mm]', get: s('slope1') },
  { label: 'Nachylenie oczekiwane próba 1 [N/mm]', get: s('slopeExp1') },
  { label: 'Odchyłka nachylenia próba 1 [%]', get: s('slopeDev1') },
  { label: 'Nachylenie F(x) próba 2 [N/mm]', get: s('slope2') },
  { label: 'Nachylenie oczekiwane próba 2 [N/mm]', get: s('slopeExp2') },
  { label: 'Odchyłka nachylenia próba 2 [%]', get: s('slopeDev2') },
  { label: 'Siła szczytowa [N]', get: s('peakF') },
  { label: 'Skok naciągu [mm]', get: s('strokeMm') },
  { label: 'Siła resztkowa próba 1 [N]', get: s('residual1') },
  { label: 'Siła resztkowa próba 2 [N]', get: s('residual2') },
  { label: 'Etap końcowy', get: s('finalStage') },
  { label: 'Alarmy', get: s('alarms') },
  { label: 'Impulsy Y3', get: s('y3Pulses') },
  { label: 'Wysokość zrzutu [m]', get: (t) => (t.kind === 'zrzut' ? t.params.wysokoscM : null), common: true },
  { label: 'Szczyt przyspieszenia [g]', get: s('contactPeakG') },
  { label: 'Źródło chwili kontaktu', get: s('contactSource') },
  { label: 'Opóźnienie kontakt-tarcza [ms]', get: s('delayMs') },
  { label: 'Rozrzut zwolnienia max-min [ms]', get: s('spreadMs') },
  { label: 'Rozrzut zadany w symulatorze [ms]', get: s('spreadSetMs') },
  { label: 'Odchylenie std chwil zwolnienia [ms]', get: s('stdMs') },
  { label: 'Liczba zwolnionych popychaczy', get: s('released') },
  { label: 'Liczba popychaczy w KONIEC', get: s('reachedEnd') },
  { label: 'Popychacze bez KONIEC', get: s('notReached') },
  { label: 'Średni czas skoku [ms]', get: s('meanStrokeMs') },
  { label: 'Średnia prędkość [m/s]', get: s('meanSpeedMS') },
  ...Array.from({ length: PUSHER_COUNT }, (_, i) => [
    { label: `P${i + 1} zwolnienie wzgl. tarczy [ms]`, get: s(`rel${i + 1}`) },
    { label: `P${i + 1} czas skoku [ms]`, get: s(`stroke${i + 1}`) },
    { label: `P${i + 1} prędkość [m/s]`, get: s(`speed${i + 1}`) },
  ]).flat(),
  { label: 'Przechył po przyziemieniu [°]', get: s('tiltAfterDeg') },
  { label: 'Alarm przechyłu', get: s('tiltAlarm') },
  { label: 'Okno szybkie kompletne', get: s('windowComplete') },
  { label: 'Uwagi', get: (t) => t.params.uwagi || null, common: true },
];
