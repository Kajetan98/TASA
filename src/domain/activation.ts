import {
  ACTIVATION_POST_MS,
  ACTIVATION_PRE_MS,
  ACTIVATION_WINDOW_WAIT_MS,
  ANCHOR_BUFFER_S,
  HALL_SWITCH_DISTANCE_MM,
  PUSHER_COUNT,
} from '../config/tasa';
import type { AnchorFrame, EventFrame, TelemetryFrame, WindowFrame } from '../protocol/anchorFrames';
import { tiltFromAcc } from './anchorState';
import { mean, range, sampleStd } from './stats';

/**
 * Rejestracja zdarzenia wyzwolenia i obliczenia czasów (docs/protokol.md, A.10).
 * Wszystkie czasy pochodzą z pola t_us mikrokontrolera; czas przeglądarki służy
 * wyłącznie do limitu oczekiwania na porcje okna.
 */

export interface AssembledWindow {
  id: number;
  ch: string;
  t0_us: number;
  dt_us: number;
  n: number;
  values: number[]; // NaN dla brakujących próbek
  received: number;
  complete: boolean;
}

/** Składa porcje ramek `window` w okna. */
export class WindowAssembler {
  private map = new Map<string, AssembledWindow & { seen: Uint8Array }>();

  add(f: WindowFrame): AssembledWindow {
    const key = `${f.id}:${f.ch}`;
    let w = this.map.get(key);
    if (!w || w.n !== f.n || w.t0_us !== f.t0_us) {
      w = { id: f.id, ch: f.ch, t0_us: f.t0_us, dt_us: f.dt_us, n: f.n, values: Array(f.n).fill(NaN), received: 0, complete: false, seen: new Uint8Array(f.n) };
      this.map.set(key, w);
    }
    for (let k = 0; k < f.v.length; k++) {
      const idx = f.i + k;
      if (!w.seen[idx]) {
        w.seen[idx] = 1;
        w.received++;
      }
      w.values[idx] = f.v[k];
    }
    w.complete = w.received === w.n;
    return w;
  }

  all(): AssembledWindow[] {
    return [...this.map.values()].map(({ seen: _seen, ...w }) => w);
  }

  clear(): void {
    this.map.clear();
  }
}

export type ContactSource = 'window' | 'imu_peak' | 'telemetry';

export interface PusherTiming {
  n: number;
  release_us: number | null;
  end_us: number | null;
  /** Czas skoku [ms]. */
  strokeMs: number | null;
  /** Średnia prędkość na odcinku między czujnikami [m/s]. */
  speedMS: number | null;
  /** Zwolnienie względem obrotu tarczy [ms]. */
  releaseAfterDiskMs: number | null;
  leftStart: boolean;
  reachedEnd: boolean;
}

export interface ActivationResult {
  disk_us: number;
  triggerSource: 'event' | 'telemetry';
  contact_us: number | null;
  contactSource: ContactSource | null;
  contactPeakG: number | null;
  delayContactToDiskMs: number | null;
  releasedCount: number;
  releaseSpreadMs: number | null;
  releaseStdMs: number | null;
  meanStrokeMs: number | null;
  meanSpeedMS: number | null;
  pushers: PusherTiming[];
  notReachedEnd: number[];
  tiltAfterDeg: number | null;
}

/** Oblicza wyniki zdarzenia z ramek zebranych w oknie. */
export function computeActivation(
  disk_us: number,
  triggerSource: 'event' | 'telemetry',
  events: EventFrame[],
  telemetry: TelemetryFrame[],
  windows: AssembledWindow[],
): ActivationResult {
  const sorted = [...events].sort((a, b) => a.t_us - b.t_us);

  // Kontakt: szczyt przyspieszenia przed obrotem tarczy (kontakt poprzedza wyzwolenie).
  let contact_us: number | null = null;
  let contactSource: ContactSource | null = null;
  let contactPeakG: number | null = null;
  const win = windows.find((w) => w.ch === 'az') ?? windows.find((w) => w.ch === 'amag');
  if (win) {
    const limit = disk_us + 2000;
    let best = -1;
    let bestV = -Infinity;
    for (let k = 0; k < win.n; k++) {
      const v = win.values[k];
      const t = win.t0_us + k * win.dt_us;
      if (!Number.isFinite(v) || t > limit) continue;
      if (Math.abs(v) > bestV) {
        bestV = Math.abs(v);
        best = k;
      }
    }
    if (best >= 0) {
      contact_us = win.t0_us + best * win.dt_us;
      contactPeakG = win.values[best];
      contactSource = 'window';
    }
  }
  if (contact_us === null) {
    const peaks = sorted.filter((e) => e.src === 'imu_peak' && e.t_us <= disk_us + 2000);
    if (peaks.length) {
      const p = peaks.reduce((a, b) => (Math.abs(b.val) > Math.abs(a.val) ? b : a));
      contact_us = p.t_us;
      contactPeakG = p.val;
      contactSource = 'imu_peak';
    }
  }
  if (contact_us === null) {
    const tel = telemetry.filter((f) => f.acc && f.t_us <= disk_us + 20_000);
    if (tel.length) {
      const p = tel.reduce((a, b) => (Math.abs(b.acc![2]) > Math.abs(a.acc![2]) ? b : a));
      contact_us = p.t_us;
      contactPeakG = p.acc![2];
      contactSource = 'telemetry';
    }
  }

  const pushers: PusherTiming[] = [];
  for (let n = 1; n <= PUSHER_COUNT; n++) {
    const rel = sorted.find((e) => e.src === 'hall' && e.ch === n && e.pos === 'start' && e.val === 0);
    const end = sorted.find((e) => e.src === 'hall' && e.ch === n && e.pos === 'end' && e.val === 1 && (!rel || e.t_us >= rel.t_us));
    const release_us = rel ? rel.t_us : null;
    const end_us = end ? end.t_us : null;
    const strokeMs = release_us !== null && end_us !== null ? (end_us - release_us) / 1000 : null;
    pushers.push({
      n,
      release_us,
      end_us,
      strokeMs,
      speedMS: strokeMs && strokeMs > 0 ? HALL_SWITCH_DISTANCE_MM / strokeMs : null, // mm/ms = m/s
      releaseAfterDiskMs: release_us !== null ? (release_us - disk_us) / 1000 : null,
      leftStart: release_us !== null,
      reachedEnd: end_us !== null,
    });
  }

  const rel = pushers.filter((p) => p.release_us !== null).map((p) => p.release_us! / 1000);
  const strokes = pushers.filter((p) => p.strokeMs !== null).map((p) => p.strokeMs!);
  const speeds = pushers.filter((p) => p.speedMS !== null).map((p) => p.speedMS!);

  // Przechył po przyziemieniu: średnia z telemetrii od 300 ms po obrocie tarczy.
  const after = telemetry.filter((f) => f.t_us >= disk_us + 300_000);
  const tilts = after
    .map((f) => (f.tilt !== null ? f.tilt : f.acc ? tiltFromAcc(f.acc) : null))
    .filter((v): v is number => v !== null);

  return {
    disk_us,
    triggerSource,
    contact_us,
    contactSource,
    contactPeakG,
    delayContactToDiskMs: contact_us !== null ? (disk_us - contact_us) / 1000 : null,
    releasedCount: rel.length,
    releaseSpreadMs: rel.length >= 2 ? range(rel) : rel.length === 1 ? 0 : null,
    releaseStdMs: rel.length >= 2 ? sampleStd(rel) : null,
    meanStrokeMs: strokes.length ? mean(strokes) : null,
    meanSpeedMS: speeds.length ? mean(speeds) : null,
    pushers,
    notReachedEnd: pushers.filter((p) => !p.reachedEnd).map((p) => p.n),
    tiltAfterDeg: tilts.length ? mean(tilts) : null,
  };
}

export interface CapturedActivation {
  disk_us: number;
  triggerSource: 'event' | 'telemetry';
  frames: AnchorFrame[];
  windows: AssembledWindow[];
  windowsComplete: boolean;
  result: ActivationResult;
}

interface OpenCapture {
  disk_us: number;
  triggerSource: 'event' | 'telemetry';
  frames: AnchorFrame[];
  assembler: WindowAssembler;
  framesDoneAt: number | null; // czas przeglądarki zamknięcia okna ramek
  windowSeen: boolean;
}

/**
 * Wykrywa zdarzenie (zbocze tarczy 0 → 1) i zbiera ramki z okna przed i po zdarzeniu.
 * `now` to czas przeglądarki [ms], używany tylko do limitu oczekiwania na porcje okna.
 */
export class ActivationRecorder {
  private buffer: AnchorFrame[] = [];
  private open: OpenCapture | null = null;
  private lastDisk: 0 | 1 | null = null;

  constructor(
    private readonly preMs = ACTIVATION_PRE_MS,
    private readonly postMs = ACTIVATION_POST_MS,
    private readonly windowWaitMs = ACTIVATION_WINDOW_WAIT_MS,
  ) {}

  get capturing(): boolean {
    return this.open !== null;
  }

  /** Przetwarza ramkę; zwraca zakończoną rejestrację albo null. */
  push(f: AnchorFrame, now: number): CapturedActivation | null {
    if (f.type === 'telemetry' || f.type === 'event' || f.type === 'status') {
      this.buffer.push(f);
      const horizon = f.t_us - ANCHOR_BUFFER_S * 1e6;
      while (this.buffer.length && this.buffer[0].t_us < horizon) this.buffer.shift();
    }

    // Wyzwalanie
    if (f.type === 'event' && f.src === 'disk' && f.val === 1) {
      if (!this.open) this.start(f.t_us, 'event');
      else if (this.open.triggerSource === 'telemetry' && Math.abs(f.t_us - this.open.disk_us) < 1e6) {
        this.open.disk_us = f.t_us; // dokładniejszy czas ze zdarzenia
        this.open.triggerSource = 'event';
      }
    }
    if (f.type === 'telemetry') {
      if (this.lastDisk === 0 && f.disk === 1 && !this.open) this.start(f.t_us, 'telemetry');
      this.lastDisk = f.disk;
    }

    const c = this.open;
    if (!c) return null;
    if (f.type === 'window') {
      c.assembler.add(f);
      c.windowSeen = true;
    } else if (f.type !== 'hello' && f.type !== 'ack') {
      if (!c.frames.includes(f)) c.frames.push(f);
      if (c.framesDoneAt === null && f.type === 'telemetry' && f.t_us >= c.disk_us + this.postMs * 1000) c.framesDoneAt = now;
    }
    return this.tick(now);
  }

  /** Sprawdza warunek zamknięcia; wywoływane także cyklicznie bez nowych ramek. */
  tick(now: number): CapturedActivation | null {
    const c = this.open;
    if (!c || c.framesDoneAt === null) return null;
    const windows = c.assembler.all();
    const allComplete = windows.length > 0 && windows.every((w) => w.complete);
    const waited = now - c.framesDoneAt;
    if (!(allComplete || waited >= this.windowWaitMs)) return null;
    this.open = null;
    const lo = c.disk_us - this.preMs * 1000;
    const hi = c.disk_us + this.postMs * 1000;
    const frames = c.frames.filter((f) => f.t_us >= lo && f.t_us <= hi).sort((a, b) => a.t_us - b.t_us);
    const events = frames.filter((f): f is EventFrame => f.type === 'event');
    const telemetry = frames.filter((f): f is TelemetryFrame => f.type === 'telemetry');
    return {
      disk_us: c.disk_us,
      triggerSource: c.triggerSource,
      frames,
      windows,
      windowsComplete: allComplete,
      result: computeActivation(c.disk_us, c.triggerSource, events, telemetry, windows),
    };
  }

  /** Przerwanie rejestracji (np. rozłączenie). */
  cancel(): void {
    this.open = null;
  }

  reset(): void {
    this.open = null;
    this.buffer = [];
    this.lastDisk = null;
  }

  private start(disk_us: number, src: 'event' | 'telemetry') {
    const lo = disk_us - this.preMs * 1000;
    this.open = {
      disk_us,
      triggerSource: src,
      frames: this.buffer.filter((b) => b.t_us >= lo),
      assembler: new WindowAssembler(),
      framesDoneAt: null,
      windowSeen: false,
    };
  }
}
