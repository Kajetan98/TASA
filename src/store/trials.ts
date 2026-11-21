import { TIP_OVER_ANGLE_DEG } from '../config/tasa';
import type { ActivationResult, AssembledWindow, CapturedActivation } from '../domain/activation';
import type { CockAttempt, StationAlarmEntry, StationCycle, StationRow } from '../domain/stationAnalysis';
import type { AnchorFrame } from '../protocol/anchorFrames';
import type { DropParams } from '../sim/anchorSim';

/** Rekord próby przechowywany w IndexedDB i eksportowany do CSV/JSON. */

export type TrialKind = 'uzbrojenie' | 'rozładowanie' | 'zrzut';
export type TrialSource = 'symulacja' | 'sprzęt';

export type SummaryValue = number | string | null;

export interface TrialParams {
  /** Badanie z programu badań (Tab. 34), np. B3, B3a, B10. */
  badanie: string;
  /** Wysokość zrzutu [m] (zrzut). */
  wysokoscM: number | null;
  uwagi: string;
}

export interface TrialRecord {
  id: string;
  kind: TrialKind;
  createdAt: string;
  source: TrialSource;
  /** Scenariusz symulacji (T1–T7) lub wariant zrzutu. */
  scenario: string | null;
  params: TrialParams;
  summary: Record<string, SummaryValue>;
  station?: {
    rows: StationRow[];
    alarms: StationAlarmEntry[];
    attempts: Omit<CockAttempt, 'xs' | 'Fs'>[];
    stagesVisited: number[];
    partial: boolean;
  };
  drop?: {
    frames: AnchorFrame[];
    windows: AssembledWindow[];
    windowsComplete: boolean;
    result: ActivationResult;
    /** Parametry zadane w symulatorze (tylko symulacja). */
    simParams: DropParams | null;
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function trialId(kind: TrialKind, d = new Date()): string {
  const p = kind === 'zrzut' ? 'Z' : kind === 'uzbrojenie' ? 'U' : 'R';
  return `${p}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const r = (v: number | null | undefined, digits = 3): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(digits));

export function cycleResultLabel(c: StationCycle): string {
  if (c.kind === 'rozładowanie') return c.finalStage === 0 && c.alarms.length === 0 ? 'ROZŁADOWANA' : 'ROZŁADOWANIE PRZERWANE';
  if (c.armed) return 'UZBROJONA';
  if (c.alarms.some((a) => a.code === 'ARM_FAILED')) return 'NIEUDANE, ROZŁADOWANA';
  if (c.alarms.length) return 'PRZERWANE ALARMEM';
  return 'NIEZAKOŃCZONE';
}

export function buildStationTrial(c: StationCycle, source: TrialSource, scenario: string | null): TrialRecord {
  const created = new Date();
  const a1 = c.attempts[0];
  const a2 = c.attempts[1];
  const peaks = c.attempts.map((a) => a.peakF).filter((v): v is number => v !== null);
  const summary: Record<string, SummaryValue> = {
    cycleTimeS: r(c.endT !== null ? c.endT - c.startT : null, 2),
    attempts: c.attempts.length,
    slope1: r(a1?.fit?.slope ?? null, 3),
    slopeExp1: r(a1?.expectedSlope ?? null, 3),
    slopeDev1: r(a1?.slopeDevPct ?? null, 2),
    slope2: r(a2?.fit?.slope ?? null, 3),
    slopeExp2: r(a2?.expectedSlope ?? null, 3),
    slopeDev2: r(a2?.slopeDevPct ?? null, 2),
    peakF: r(peaks.length ? Math.max(...peaks) : null, 1),
    strokeMm: r(a1?.stroke ?? null, 2),
    residual1: r(a1?.residualF ?? null, 1),
    residual2: r(a2?.residualF ?? null, 1),
    finalStage: c.finalStage,
    alarms: c.alarms.map((a) => a.code).join(' ') || null,
    y3Pulses: c.y3Pulses,
    result: cycleResultLabel(c),
  };
  return {
    id: trialId(c.kind, created),
    kind: c.kind,
    createdAt: created.toISOString(),
    source,
    scenario,
    params: { badanie: c.kind === 'rozładowanie' ? 'B11' : 'B10', wysokoscM: null, uwagi: '' },
    summary,
    station: {
      rows: c.rows,
      alarms: c.alarms,
      attempts: c.attempts.map(({ xs: _xs, Fs: _Fs, ...rest }) => rest),
      stagesVisited: c.stagesVisited,
      partial: c.partial,
    },
  };
}

export function buildDropTrial(c: CapturedActivation, source: TrialSource, simParams: DropParams | null): TrialRecord {
  const created = new Date();
  const res = c.result;
  const summary: Record<string, SummaryValue> = {
    contactPeakG: r(res.contactPeakG, 2),
    contactSource: res.contactSource === 'window' ? 'okno szybkie' : res.contactSource === 'imu_peak' ? 'zdarzenie imu_peak' : res.contactSource === 'telemetry' ? 'telemetria (niska rozdzielczość)' : null,
    delayMs: r(res.delayContactToDiskMs, 3),
    spreadMs: r(res.releaseSpreadMs, 3),
    stdMs: r(res.releaseStdMs, 3),
    released: res.releasedCount,
    reachedEnd: res.pushers.filter((p) => p.reachedEnd).length,
    notReached: res.notReachedEnd.length ? res.notReachedEnd.map((n) => `P${n}`).join(' ') : null,
    meanStrokeMs: r(res.meanStrokeMs, 3),
    meanSpeedMS: r(res.meanSpeedMS, 3),
    tiltAfterDeg: r(res.tiltAfterDeg, 1),
    tiltAlarm: res.tiltAfterDeg === null ? null : res.tiltAfterDeg >= TIP_OVER_ANGLE_DEG ? 'tak' : 'nie',
    spreadSetMs: simParams ? r(simParams.spreadMs, 3) : null,
    windowComplete: c.windows.length === 0 ? 'brak okna' : c.windowsComplete ? 'tak' : 'niekompletne',
  };
  for (const p of res.pushers) {
    summary[`rel${p.n}`] = r(p.releaseAfterDiskMs, 3);
    summary[`stroke${p.n}`] = r(p.strokeMs, 3);
    summary[`speed${p.n}`] = r(p.speedMS, 2);
  }
  let scenario: string | null = null;
  if (simParams) {
    const pl = (v: number) => v.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
    const parts = [`h = ${pl(simParams.heightM)} m`, `rozrzut ${pl(simParams.spreadMs)} ms`];
    if (simParams.blockedPusher) parts.push(`P${simParams.blockedPusher} zablokowany`);
    scenario = parts.join(', ');
  }
  return {
    id: trialId('zrzut', created),
    kind: 'zrzut',
    createdAt: created.toISOString(),
    source,
    scenario,
    params: { badanie: 'B3', wysokoscM: simParams ? simParams.heightM : null, uwagi: '' },
    summary,
    drop: { frames: c.frames, windows: c.windows, windowsComplete: c.windowsComplete, result: res, simParams },
  };
}
