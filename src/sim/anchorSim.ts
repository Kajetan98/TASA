import {
  ANCHOR_TELEMETRY_HZ,
  ANCHOR_WINDOW_HZ,
  ANCHOR_WINDOW_POST_MS,
  ANCHOR_WINDOW_PRE_MS,
  PUSHER_COUNT,
} from '../config/tasa';
import { Rng } from './rng';

/**
 * Symulator modułu pomiarowego kotwicy. Generuje linie JSON zgodne z docs/protokol.md (część A):
 * telemetry, event, status, window, hello, ack. Czasy zdarzeń są znane dokładnie (prawda symulacji),
 * co pozwala sprawdzić obliczenia rozrzutu w aplikacji.
 *
 * Wartości domyślne czasów wyzwolenia pochodzą z symulacji dynamicznej w pracy (podrozdział 8.1):
 * wyzwolenie 7,2 ms po kontakcie, koniec skoku sprężyn 12,6 ms po kontakcie (skok ok. 5,4 ms).
 * Szczyt przyspieszenia i czas impulsu są założeniami symulatora (typ IMU niewybrany).
 */

export interface DropParams {
  /** Wysokość zrzutu [m]; badanie B3: 0,08–0,33 m. */
  heightM: number;
  /** Opóźnienie kontakt → obrót tarczy [ms]. Praca 8.1: 7,2 ms. */
  contactToDiskMs: number;
  /** Opóźnienie zwolnienia pierwszego zaczepu względem zbocza czujnika tarczy [ms] (sym.). */
  latchLagMs: number;
  /** Zadany rozrzut chwil zwolnienia max − min [ms]. */
  spreadMs: number;
  /** Nominalny czas skoku popychacza [ms]. Praca 8.1: 12,6 − 7,2 = 5,4 ms. */
  strokeMs: number;
  /** Względne odchylenie standardowe czasu skoku (sym.). */
  strokeJitter: number;
  /** Numer zablokowanego popychacza (1–6) albo null. */
  blockedPusher: number | null;
  /** Szczyt przyspieszenia przy kontakcie [g] (sym.). */
  peakG: number;
  /** Czas impulsu kontaktu [ms] (sym.). */
  pulseMs: number;
  /** Przechył po przyziemieniu [°]. */
  tiltAfterDeg: number;
}

export const defaultDropParams = (): DropParams => ({
  heightM: 0.2,
  contactToDiskMs: 7.2,
  latchLagMs: 0.3,
  spreadMs: 2.0,
  strokeMs: 5.4,
  strokeJitter: 0.03,
  blockedPusher: null,
  peakG: 40,
  pulseMs: 3,
  tiltAfterDeg: 3,
});

export interface AnchorSimConfig {
  seed: number;
  /** Czy moduł ma czujnik zawleczki (pole pin w telemetry). */
  pinSensor: boolean;
  /** Czy firmware wysyła pole tilt. */
  tiltInFirmware: boolean;
  /** Czy firmware wysyła zdarzenie imu_peak. */
  firmwarePeak: boolean;
  telemetryHz: number;
  windowHz: number;
  preMs: number;
  postMs: number;
  /** Czas od startu mikrokontrolera [µs] w chwili uruchomienia symulacji. */
  bootOffsetUs: number;
}

export const defaultAnchorSimConfig = (): AnchorSimConfig => ({
  seed: 11,
  pinSensor: true,
  tiltInFirmware: false,
  firmwarePeak: true,
  telemetryHz: ANCHOR_TELEMETRY_HZ,
  windowHz: ANCHOR_WINDOW_HZ,
  preMs: ANCHOR_WINDOW_PRE_MS,
  postMs: ANCHOR_WINDOW_POST_MS,
  bootOffsetUs: 4_200_000,
});

/** Prawdziwe czasy zdarzeń zrzutu (µs czasu mikrokontrolera). */
export interface DropTruth {
  release_us: number;
  contact_us: number;
  disk_us: number;
  latchRelease_us: (number | null)[];
  end_us: (number | null)[];
  spreadSetMs: number;
  params: DropParams;
}

type Phase = 'hanging' | 'falling' | 'landed';

interface Scheduled {
  t: number;
  run: () => void;
}

const G = 9.80665;

export class AnchorSim {
  readonly cfg: AnchorSimConfig;
  private rng: Rng;
  private t: number;
  private seq = 0;
  private lines: string[] = [];
  private queue: Scheduled[] = [];
  private nextTel: number;
  private nextStatus: number;
  private windowQueue: string[] = [];
  private captureId = 0;
  private captureArmed = true;

  hs = (1 << PUSHER_COUNT) - 1;
  he = 0;
  disk: 0 | 1 = 0;
  pin: 0 | 1 = 1;
  phase: Phase = 'hanging';
  private tilt0 = 0.6;
  private drop: DropTruth | null = null;
  lastDrop: DropTruth | null = null;
  vbat = 4.05;

  constructor(cfg: Partial<AnchorSimConfig> = {}) {
    this.cfg = { ...defaultAnchorSimConfig(), ...cfg };
    this.rng = new Rng(this.cfg.seed);
    this.t = this.cfg.bootOffsetUs;
    this.nextTel = this.t;
    this.nextStatus = this.t + 50_000;
  }

  get nowUs(): number {
    return this.t;
  }

  private frame(o: Record<string, unknown>) {
    this.lines.push(JSON.stringify({ ...o, seq: this.seq++ }));
  }

  hello(): string[] {
    this.frame({
      type: 'hello', t_us: this.t, dev: 'TASA-MOD-SIM', fw: '0.1.0-sim', proto: 1,
      tel_hz: this.cfg.telemetryHz, win_hz: this.cfg.windowHz, pre_ms: this.cfg.preMs, post_ms: this.cfg.postMs,
    });
    return this.drain();
  }

  // ───────────── model przyspieszenia ─────────────
  private trueTiltDeg(t: number): number {
    const d = this.drop;
    if (!d || t < d.contact_us) return this.tilt0;
    const tau = Math.min(1, (t - d.contact_us) / 60_000);
    return this.tilt0 + (d.params.tiltAfterDeg - this.tilt0) * tau;
  }

  /** Przyspieszenie [g] w układzie modułu w chwili t (bez szumu). */
  accAt(t: number): [number, number, number] {
    const d = this.drop;
    const tiltRad = (this.trueTiltDeg(t) * Math.PI) / 180;
    const rest: [number, number, number] = [Math.sin(tiltRad), 0, Math.cos(tiltRad)];
    if (!d || t < d.release_us) return rest;
    const p = d.params;
    if (t < d.contact_us - (p.pulseMs * 500)) return [0, 0, 0]; // swobodny spadek
    let az = 0;
    const dtc = (t - d.contact_us) / 1000; // ms
    if (Math.abs(dtc) < p.pulseMs / 2) az += p.peakG * Math.cos((Math.PI * dtc) / p.pulseMs);
    if (dtc >= p.pulseMs / 2) {
      // tłumione drgania po kontakcie i powrót do stanu spoczynku
      az += rest[2] * Math.min(1, (dtc - p.pulseMs / 2) / 2) + 0.35 * Math.exp(-dtc / 15) * Math.sin(2 * Math.PI * 0.12 * dtc);
    }
    // impuls odrzutu przy zwolnieniu każdego popychacza (sym.)
    for (const r of d.latchRelease_us) {
      if (r === null) continue;
      const dr = (t - r) / 1000;
      if (dr >= 0 && dr < 1) az -= 1.5 * Math.sin(Math.PI * dr);
    }
    const lateral = dtc >= p.pulseMs / 2 ? rest[0] * Math.min(1, (dtc - p.pulseMs / 2) / 2) : 0;
    return [lateral, 0, az];
  }

  private noisy(a: [number, number, number]): [number, number, number] {
    return [a[0] + this.rng.gauss(0.004), a[1] + this.rng.gauss(0.004), a[2] + this.rng.gauss(0.006)];
  }

  // ───────────── ramki ─────────────
  private telemetry() {
    const acc = this.noisy(this.accAt(this.t));
    const o: Record<string, unknown> = {
      type: 'telemetry',
      t_us: this.t,
      acc: acc.map((v) => Math.round(v * 1000) / 1000),
      hs: this.hs,
      he: this.he,
      disk: this.disk,
    };
    if (this.cfg.tiltInFirmware) o.tilt = Math.round(this.trueTiltDeg(this.t) * 10) / 10;
    if (this.cfg.pinSensor) o.pin = this.pin;
    this.frame(o);
  }

  private status() {
    this.vbat = Math.max(3.3, this.vbat - 0.00002);
    this.frame({
      type: 'status', t_us: this.t, vbat: Math.round(this.vbat * 100) / 100,
      rssi: Math.round(-58 + this.rng.gauss(2)), fw: '0.1.0-sim', err: 0, cap: this.captureArmed ? 1 : 0,
    });
  }

  private event(t: number, src: string, extra: Record<string, unknown>) {
    this.frame({ type: 'event', t_us: t, src, ...extra });
  }

  private schedule(t: number, run: () => void) {
    this.queue.push({ t, run });
    this.queue.sort((a, b) => a.t - b.t);
  }

  // ───────────── działania operatora / stanowiska ─────────────
  removePin() {
    if (this.pin === 0) return;
    this.pin = 0;
    if (this.cfg.pinSensor) this.event(this.t, 'pin', { val: 0 });
  }

  insertPin() {
    if (this.pin === 1) return;
    this.pin = 1;
    if (this.cfg.pinSensor) this.event(this.t, 'pin', { val: 1 });
  }

  /** Kotwica ponownie uzbrojona w stacji (popychacze w START, tarcza zamknięta, zawleczka obecna). */
  rearmMechanism() {
    this.queue = [];
    this.drop = null;
    this.phase = 'hanging';
    this.disk = 0;
    this.hs = (1 << PUSHER_COUNT) - 1;
    this.he = 0;
    this.pin = 1;
    this.captureArmed = true;
    this.windowQueue = [];
  }

  /** Zrzut: usunięcie zawleczki, zwolnienie elektromagnesu, spadek, kontakt, wyzwolenie. */
  startDrop(params: Partial<DropParams> = {}): DropTruth {
    const p = { ...defaultDropParams(), ...params };
    if (this.pin === 1) this.schedule(this.t + 100_000, () => this.removePin());
    const release = this.t + 400_000;
    const fallUs = Math.round(Math.sqrt((2 * p.heightM) / G) * 1e6);
    const contact = release + fallUs;
    const disk = contact + Math.round(p.contactToDiskMs * 1000);

    // Rozrzut: losowe przesunięcia przeskalowane tak, aby max − min było dokładnie równe zadanemu.
    const spreadUs = Math.round(p.spreadMs * 1000);
    const active = Array.from({ length: PUSHER_COUNT }, (_, i) => i + 1 !== p.blockedPusher);
    const u = active.map((a) => (a ? this.rng.next() : NaN));
    const vals = u.filter((v) => !Number.isNaN(v));
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const lag = Math.round(p.latchLagMs * 1000);
    const latchRelease: (number | null)[] = u.map((v) =>
      Number.isNaN(v) ? null : disk + lag + Math.round(hi > lo ? ((v - lo) / (hi - lo)) * spreadUs : 0),
    );
    const end = latchRelease.map((r) =>
      r === null ? null : r + Math.round(p.strokeMs * 1000 * (1 + this.rng.gauss(p.strokeJitter))),
    );
    const truth: DropTruth = {
      release_us: release, contact_us: contact, disk_us: disk,
      latchRelease_us: latchRelease, end_us: end, spreadSetMs: spreadUs / 1000, params: p,
    };

    this.schedule(release, () => {
      this.drop = truth;
      this.phase = 'falling';
    });
    this.schedule(contact, () => {
      this.phase = 'landed';
      if (this.cfg.firmwarePeak) this.event(contact, 'imu_peak', { val: p.peakG });
    });
    this.schedule(disk, () => {
      this.disk = 1;
      this.event(disk, 'disk', { val: 1 });
      if (this.captureArmed) this.schedule(disk + this.cfg.postMs * 1000 + 2000, () => this.buildWindow(truth));
    });
    latchRelease.forEach((r, i) => {
      if (r === null) return;
      this.schedule(r, () => {
        this.hs &= ~(1 << i);
        this.event(r, 'hall', { ch: i + 1, pos: 'start', val: 0 });
      });
    });
    end.forEach((e, i) => {
      if (e === null) return;
      this.schedule(e, () => {
        this.he |= 1 << i;
        this.event(e, 'hall', { ch: i + 1, pos: 'end', val: 1 });
      });
    });
    this.lastDrop = truth;
    return truth;
  }

  private buildWindow(d: DropTruth) {
    this.captureArmed = false;
    const id = ++this.captureId;
    const dt = Math.round(1e6 / this.cfg.windowHz);
    const t0 = d.disk_us - this.cfg.preMs * 1000;
    const n = Math.round(((this.cfg.preMs + this.cfg.postMs) * 1000) / dt);
    const vals: number[] = [];
    for (let k = 0; k < n; k++) vals.push(Math.round((this.accAt(t0 + k * dt)[2] + this.rng.gauss(0.01)) * 1000) / 1000);
    const CH = 40;
    for (let i = 0; i < n; i += CH) {
      const v = vals.slice(i, i + CH);
      this.windowQueue.push(JSON.stringify({ type: 'window', id, ch: 'az', t0_us: t0, dt_us: dt, n, i, v }));
    }
  }

  // ───────────── polecenia ─────────────
  command(line: string) {
    let o: { cmd?: string; id?: number };
    try {
      o = JSON.parse(line);
    } catch {
      return;
    }
    switch (o.cmd) {
      case 'hello':
        this.hello().forEach((l) => this.lines.push(l));
        break;
      case 'status':
        this.status();
        break;
      case 'rearm':
        this.captureArmed = true;
        this.frame({ type: 'ack', t_us: this.t, cmd: 'rearm', ok: true });
        break;
      case 'ping':
        this.frame({ type: 'ack', t_us: this.t, cmd: 'ping', ok: true, id: o.id });
        break;
      default:
        this.frame({ type: 'ack', t_us: this.t, cmd: String(o.cmd ?? ''), ok: false });
    }
  }

  // ───────────── czas ─────────────
  advance(ms: number): string[] {
    const target = this.t + Math.round(ms * 1000);
    const telPeriod = Math.round(1e6 / this.cfg.telemetryHz);
    for (;;) {
      const nextQ = this.queue.length ? this.queue[0].t : Infinity;
      const next = Math.min(this.nextTel, this.nextStatus, nextQ);
      if (next > target) break;
      this.t = Math.max(this.t, next);
      if (nextQ === next) {
        const item = this.queue.shift()!;
        item.run();
      } else if (this.nextTel === next) {
        this.telemetry();
        this.nextTel += telPeriod;
      } else {
        this.status();
        this.nextStatus += 1_000_000;
      }
    }
    this.t = target;
    // porcje okna wysyłane stopniowo, ok. 2 porcje na 1 ms
    const k = Math.min(this.windowQueue.length, Math.max(1, Math.round(ms * 2)));
    for (let i = 0; i < k; i++) {
      const raw = JSON.parse(this.windowQueue.shift()!);
      this.frame({ ...raw, t_us: this.t });
    }
    return this.drain();
  }

  drain(): string[] {
    const out = this.lines;
    this.lines = [];
    return out;
  }
}
