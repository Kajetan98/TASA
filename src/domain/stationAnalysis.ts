import {
  ARM_RECORD_SETTLE_S,
  FIT_END_MARGIN_MM,
  FIT_SKIP_START_MM,
  PUSHER_COUNT,
  RESIDUAL_FORCE_LIMIT_N,
  RESIDUAL_ONE_LATCH_N,
  SLOPE_NOMINAL_N_PER_MM,
  SLOPE_TOLERANCE,
} from '../config/tasa';
import type { LineFit } from './stats';
import { fitLine } from './stats';

/** Analiza cyklu uzbrajania z wierszy LOG (t w sekundach, x w mm, F w N). */

export interface StationRow {
  t: number;
  stage: number;
  x: number;
  F: number | null;
}

export interface CockAttempt {
  index: number;
  t0: number;
  x0: number;
  /** Punkty etapu 4 (x, F). */
  xs: number[];
  Fs: number[];
  fit: LineFit | null;
  expectedSlope: number;
  expectedSource: 'nominalna' | 'szacunek z siły resztkowej';
  slopeDevPct: number | null;
  slopeOk: boolean | null;
  peakF: number | null;
  stroke: number | null;
  residualF: number | null;
  residualOk: boolean | null;
  /** Punkt zakotwiczenia linii oczekiwanej (pierwszy punkt dopasowania). */
  anchorX: number | null;
  anchorF: number | null;
  finished: boolean;
}

function newAttempt(index: number, row: StationRow, prev: CockAttempt | null): CockAttempt {
  let expectedSlope = SLOPE_NOMINAL_N_PER_MM;
  let expectedSource: CockAttempt['expectedSource'] = 'nominalna';
  if (prev && prev.residualF !== null && prev.residualF >= RESIDUAL_FORCE_LIMIT_N) {
    const n = Math.min(PUSHER_COUNT, Math.max(1, Math.round(prev.residualF / RESIDUAL_ONE_LATCH_N)));
    expectedSlope = (SLOPE_NOMINAL_N_PER_MM * n) / PUSHER_COUNT;
    expectedSource = 'szacunek z siły resztkowej';
  }
  return {
    index, t0: row.t, x0: row.x, xs: [], Fs: [], fit: null, expectedSlope, expectedSource,
    slopeDevPct: null, slopeOk: null, peakF: null, stroke: null, residualF: null, residualOk: null,
    anchorX: null, anchorF: null, finished: false,
  };
}

/** Dopasowanie prostej do punktów naciągu z pominięciem początku i końca skoku. */
export function analyzeAttempt(a: CockAttempt): void {
  if (a.xs.length === 0) return;
  const xLast = a.xs[a.xs.length - 1];
  const fx: number[] = [];
  const fy: number[] = [];
  let peak = -Infinity;
  for (let i = 0; i < a.xs.length; i++) {
    const d = a.xs[i] - a.x0;
    const F = a.Fs[i];
    if (d > 10 && F > peak) peak = F;
    if (d >= FIT_SKIP_START_MM && a.xs[i] <= xLast - FIT_END_MARGIN_MM) {
      fx.push(a.xs[i]);
      fy.push(F);
    }
  }
  a.fit = fitLine(fx, fy);
  a.peakF = Number.isFinite(peak) ? peak : null;
  a.stroke = xLast - a.x0;
  if (fx.length) {
    a.anchorX = fx[0];
    a.anchorF = a.fit ? a.fit.slope * fx[0] + a.fit.intercept : fy[0];
  }
  if (a.fit) {
    a.slopeDevPct = (a.fit.slope / a.expectedSlope - 1) * 100;
    a.slopeOk = Math.abs(a.slopeDevPct) <= SLOPE_TOLERANCE * 100;
  }
}

/** Śledzi wiersze cyklu i wyznacza próby naciągu (etap 4) oraz siłę resztkową (etap 5). */
export class CockAnalyzer {
  attempts: CockAttempt[] = [];
  private stage5: StationRow[] = [];
  private prevStage: number | null = null;

  get current(): CockAttempt | null {
    return this.attempts.length ? this.attempts[this.attempts.length - 1] : null;
  }

  add(row: StationRow): void {
    const prev = this.prevStage;
    this.prevStage = row.stage;
    if (row.stage === 4 && prev !== 4) {
      this.attempts.push(newAttempt(this.attempts.length + 1, row, this.current));
    }
    const a = this.current;
    if (row.stage === 4 && a && row.F !== null) {
      a.xs.push(row.x);
      a.Fs.push(row.F);
      // dopasowanie bieżące co 10 punktów (podgląd na żywo)
      if (a.xs.length % 10 === 0) analyzeAttempt(a);
    }
    if (prev === 4 && row.stage !== 4 && a) {
      analyzeAttempt(a);
      a.finished = true;
    }
    if (row.stage === 5) this.stage5.push(row);
    if (prev === 5 && row.stage !== 5 && a) {
      a.residualF = residualFrom(this.stage5);
      a.residualOk = a.residualF === null ? null : a.residualF < RESIDUAL_FORCE_LIMIT_N;
      this.stage5 = [];
    }
  }
}

/** Siła resztkowa: średnia z wierszy etapu 5 po zatrzymaniu płyty (końcowe położenie). */
export function residualFrom(rows: StationRow[]): number | null {
  if (rows.length === 0) return null;
  const xEnd = rows[rows.length - 1].x;
  const still = rows.filter((r) => Math.abs(r.x - xEnd) < 0.02 && r.F !== null);
  const use = still.length >= 3 ? still.slice(Math.floor(still.length / 3)) : still;
  if (use.length === 0) return null;
  return use.reduce((s, r) => s + (r.F as number), 0) / use.length;
}

// ───────────── rekord cyklu ─────────────

export type StationTrialKind = 'uzbrojenie' | 'rozładowanie';

export interface StationAlarmEntry {
  code: string;
  text: string;
  /** Czas sterownika [s] z ostatniego wiersza LOG przed alarmem. */
  t: number | null;
  /** Czas przeglądarki (ISO). */
  at: string;
}

export interface StationCycle {
  kind: StationTrialKind;
  startT: number;
  endT: number | null;
  startedAt: string;
  rows: StationRow[];
  alarms: StationAlarmEntry[];
  stagesVisited: number[];
  attempts: CockAttempt[];
  y3Pulses: number;
  finalStage: number | null;
  armed: boolean;
  /** Rejestracja rozpoczęta w trakcie cyklu (po połączeniu). */
  partial: boolean;
}

/**
 * Otwiera rekord przy wyjściu z etapu 0 lub 6 do etapu roboczego, zamyka przy powrocie do etapu 0
 * albo po ustaleniu się etapu 6 bez ruchu płyty.
 */
export class CycleRecorder {
  private cycle: StationCycle | null = null;
  private analyzer = new CockAnalyzer();
  private prevStage: number | null = null;
  private stillSince: number | null = null;
  private lastX: number | null = null;

  get active(): StationCycle | null {
    return this.cycle;
  }

  get analyzerAttempts(): CockAttempt[] {
    return this.analyzer.attempts;
  }

  /** Dodaje wiersz; zwraca zamknięty cykl albo null. */
  addRow(row: StationRow): StationCycle | null {
    const prev = this.prevStage;
    this.prevStage = row.stage;
    let closedEarly: StationCycle | null = null;
    // Rozładowanie uzbrojonej kotwicy (6 → 8) zamyka rekord uzbrojenia i otwiera rekord rozładowania.
    if (this.cycle && prev === 6 && row.stage === 8) {
      const last = this.cycle.rows[this.cycle.rows.length - 1];
      closedEarly = this.close(last ?? row);
    }
    const working = row.stage !== 0 && row.stage !== 6;
    if (!this.cycle && working && (prev === 0 || prev === 6 || prev === null)) {
      this.analyzer = new CockAnalyzer();
      this.cycle = {
        kind: prev === 6 && row.stage === 8 ? 'rozładowanie' : 'uzbrojenie',
        startT: row.t,
        endT: null,
        startedAt: new Date().toISOString(),
        rows: [],
        alarms: [],
        stagesVisited: [],
        attempts: this.analyzer.attempts,
        y3Pulses: 0,
        finalStage: null,
        armed: false,
        partial: prev === null,
      };
    }
    const c = this.cycle;
    if (!c) return closedEarly;
    c.rows.push(row);
    this.analyzer.add(row);
    if (!c.stagesVisited.includes(row.stage)) c.stagesVisited.push(row.stage);

    if (this.lastX !== null && Math.abs(row.x - this.lastX) < 0.005) {
      if (this.stillSince === null) this.stillSince = row.t;
    } else this.stillSince = null;
    this.lastX = row.x;

    const settled6 = row.stage === 6 && this.stillSince !== null && row.t - this.stillSince >= ARM_RECORD_SETTLE_S;
    const back0 = row.stage === 0 && prev !== 0 && prev !== null;
    const stuck = this.stillSince !== null && row.t - this.stillSince >= 30 && c.alarms.length > 0;
    if (settled6 || back0 || stuck) return this.close(row);
    return closedEarly;
  }

  addAlarm(a: StationAlarmEntry): void {
    if (this.cycle) this.cycle.alarms.push(a);
  }

  addY3Pulse(): void {
    if (this.cycle) this.cycle.y3Pulses++;
  }

  /** Wymuszone zamknięcie (rozłączenie, zatrzymanie z alarmem). */
  flush(): StationCycle | null {
    const c = this.cycle;
    if (!c) return null;
    const last = c.rows[c.rows.length - 1];
    return last ? this.close(last) : ((this.cycle = null), null);
  }

  private close(row: StationRow): StationCycle {
    const c = this.cycle!;
    for (const a of c.attempts) if (!a.finished) analyzeAttempt(a);
    c.endT = row.t;
    c.finalStage = row.stage;
    c.armed = row.stage === 6;
    this.cycle = null;
    return c;
  }
}
