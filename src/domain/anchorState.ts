import { LINK_TIMEOUT_MS, PUSHER_COUNT } from '../config/tasa';
import type { TelemetryFrame } from '../protocol/anchorFrames';
import { pusherBit } from '../protocol/anchorFrames';

/** Wyznaczanie stanu logicznego kotwicy z czujników Halla, tarczy i zawleczki (docs/protokol.md, A.9). */

export type AnchorStateCode =
  | 'NO_DATA'
  | 'DISARMED'
  | 'ARMED'
  | 'ARMED_PIN'
  | 'TRIGGERED'
  | 'PARTIAL'
  | 'UNDETERMINED';

export const ANCHOR_STATE_LABEL: Record<AnchorStateCode, string> = {
  NO_DATA: 'BRAK DANYCH',
  DISARMED: 'ROZBROJONA',
  ARMED: 'UZBROJONA',
  ARMED_PIN: 'UZBROJONA Z ZAWLECZKĄ',
  TRIGGERED: 'WYZWOLONA',
  PARTIAL: 'NIEPEŁNE WYZWOLENIE',
  UNDETERMINED: 'NIEOKREŚLONY',
};

/** Położenie popychacza wynikające z pary czujników START/KONIEC. */
export type PusherPosition = 'start' | 'end' | 'mid' | 'fault';

export interface AnchorStateResult {
  code: AnchorStateCode;
  label: string;
  /** Uzasadnienie stanu w jednym zdaniu. */
  reason: string;
  pushers: PusherPosition[];
  disk: 0 | 1 | null;
  pin: 0 | 1 | null;
  /** Ostatnia ramka starsza niż limit łączności. */
  stale: boolean;
  /** Popychacze (1..6), które nie są w KONIEC przy obróconej tarczy. */
  notAtEnd: number[];
}

export function pusherPositions(hs: number, he: number): PusherPosition[] {
  const out: PusherPosition[] = [];
  for (let n = 1; n <= PUSHER_COUNT; n++) {
    const s = pusherBit(hs, n);
    const e = pusherBit(he, n);
    out.push(s && e ? 'fault' : s ? 'start' : e ? 'end' : 'mid');
  }
  return out;
}

const list = (ns: number[]) => ns.map((n) => `P${n}`).join(', ');

export function deriveAnchorState(tel: TelemetryFrame | null, ageMs: number | null): AnchorStateResult {
  if (!tel) {
    return {
      code: 'NO_DATA',
      label: ANCHOR_STATE_LABEL.NO_DATA,
      reason: 'Nie odebrano ramki telemetry z modułu kotwicy.',
      pushers: Array(PUSHER_COUNT).fill('mid'),
      disk: null,
      pin: null,
      stale: true,
      notAtEnd: [],
    };
  }
  const pushers = pusherPositions(tel.hs, tel.he);
  const stale = ageMs === null || ageMs > LINK_TIMEOUT_MS;
  const idx = (p: PusherPosition) => pushers.map((v, i) => (v === p ? i + 1 : 0)).filter(Boolean);
  const faults = idx('fault');
  const notAtEnd = pushers.map((v, i) => (v !== 'end' ? i + 1 : 0)).filter(Boolean);
  const base = { pushers, disk: tel.disk, pin: tel.pin, stale, notAtEnd: tel.disk === 1 ? notAtEnd : [] };
  const make = (code: AnchorStateCode, reason: string): AnchorStateResult => ({ code, label: ANCHOR_STATE_LABEL[code], reason, ...base });

  if (faults.length > 0) {
    return make('UNDETERMINED', `Czujniki START i KONIEC aktywne jednocześnie: ${list(faults)} (błąd czujnika lub listwy).`);
  }
  const allStart = pushers.every((p) => p === 'start');
  const allEnd = pushers.every((p) => p === 'end');
  if (tel.disk === 0) {
    if (allStart) {
      if (tel.pin === 1) return make('ARMED_PIN', 'Wszystkie popychacze w START, tarcza zamknięta, zawleczka obecna.');
      if (tel.pin === 0) return make('ARMED', 'Wszystkie popychacze w START, tarcza zamknięta, zawleczka usunięta.');
      return make('ARMED', 'Wszystkie popychacze w START, tarcza zamknięta; stan zawleczki nieznany (moduł nie wysyła pola pin).');
    }
    if (allEnd) return make('DISARMED', 'Wszystkie popychacze w KONIEC, tarcza zamknięta.');
    const inStart = idx('start');
    const mid = idx('mid');
    const parts: string[] = [];
    if (inStart.length) parts.push(`w START: ${list(inStart)}`);
    if (mid.length) parts.push(`w położeniu pośrednim: ${list(mid)}`);
    return make('UNDETERMINED', `Tarcza zamknięta, popychacze w różnych położeniach (${parts.join('; ')}).`);
  }
  if (allEnd) return make('TRIGGERED', 'Tarcza obrócona, wszystkie popychacze w KONIEC.');
  return make('PARTIAL', `Tarcza obrócona; nie w KONIEC: ${list(notAtEnd)}.`);
}

/** Przechył osi względem pionu z wektora przyspieszenia [°]; przybliżenie statyczne. */
export function tiltFromAcc(acc: readonly [number, number, number]): number | null {
  const [x, y, z] = acc;
  const m = Math.hypot(x, y, z);
  if (m < 0.2) return null; // swobodny spadek lub brak danych: kierunek pionu nieokreślony
  const c = Math.max(-1, Math.min(1, z / m));
  return (Math.acos(c) * 180) / Math.PI;
}
