import {
  APPROACH_MM,
  BACKOFF_MM,
  COCK_SPEED_MM_S,
  COCK_STROKE_MM,
  CONTACT_FORCE_N,
  FAST_SPEED_MM_S,
  FIT_END_MARGIN_MM,
  FIT_SKIP_START_MM,
  MAX_COCK_ATTEMPTS,
  OVERLOAD_FORCE_N,
  PEAK_FORCE_N,
  PRELOAD_FORCE_N,
  PUSHER_COUNT,
  RESIDUAL_FORCE_LIMIT_N,
  RESIDUAL_ONE_LATCH_N,
  SLOPE_NOMINAL_N_PER_MM,
  SLOPE_TOLERANCE,
  STATION_LOG_PERIOD_MS,
} from '../config/tasa';
import { IncrementalLineFit } from '../domain/stats';
import { Rng } from './rng';

/**
 * Symulator stacji uzbrajania odtwarzający zachowanie sterownika opisane w pracy
 * (podrozdziały 6.7, 7.5, 7.10.4–7.10.5). Emuluje firmware: generuje wiersze LOG `t, stan, x, F`
 * co 20 ms oraz wiersze rozszerzenia (IO, STATUS, ALARM, OK/ERR).
 *
 * Parametry modelu oznaczone jako "sym." są założeniami symulatora, a nie danymi sprzętu.
 */

export type LatchFault = 'ok' | 'permanent' | 'transient';

export interface StationSimConfig {
  springsPresent: boolean[];
  latchFaults: LatchFault[];
  /** Odchylenie standardowe szumu czujnika siły [N]. Praca: 1 N. */
  noiseN: number;
  seed: number;
  /** Czy firmware wysyła wiersze IO/STATUS/ALARM (rozszerzenie protokołu). */
  extensions: boolean;
  /** Czas od włączenia sterownika do początku symulacji [ms] (wartość pola t). */
  bootOffsetMs: number;
}

export const defaultStationSimConfig = (): StationSimConfig => ({
  springsPresent: Array(PUSHER_COUNT).fill(true),
  latchFaults: Array(PUSHER_COUNT).fill('ok'),
  noiseN: 1,
  seed: 7,
  extensions: true,
  bootOffsetMs: 1520,
});

// Parametry modelu mechaniki.
const K_CONTACT = 500; // sztywność kontaktu pręt–popychacz [N/mm], praca 7.10.5
// Sztywność i napięcie wstępne jednej sprężyny w osi płyty dobrane tak, aby po szeregowym
// połączeniu z kontaktem pręt–popychacz charakterystyka na płycie miała 25,6 N/mm i 277 N (praca 6.7).
const KS_EFF = SLOPE_NOMINAL_N_PER_MM / PUSHER_COUNT;
const KS = (KS_EFF * K_CONTACT) / (K_CONTACT - KS_EFF);
const PRE = ((PRELOAD_FORCE_N / PUSHER_COUNT) * (K_CONTACT + KS)) / K_CONTACT;
const P_LATCH = COCK_STROKE_MM; // ugięcie sprężyny, przy którym zaczep się zatrzaskuje [mm]
const X_CONTACT = APPROACH_MM; // położenie oparcia prętów o popychacze [mm]
const X_S2 = X_CONTACT + P_LATCH + 0.55; // krańcówka S2 [mm] (sym.)
const ACCEL = 50; // przyspieszenie rampy [mm/s²], praca 7.10.6
const ACTUATOR_DELAY_MS = 400; // opóźnienie siłowników Y1/Y2 do potwierdzenia czujnikiem (sym.)
const SENSOR_PERIOD_MS = 3; // czujnik siły ok. 320 próbek/s, praca 7.10.1
const SENSOR_TIMEOUT_MS = 50; // brak próbki w ruchu → SENSOR, praca 7.10.4
const FIT_CHECK_MM = 20; // droga, po której sterownik sprawdza nachylenie (sym., do potwierdzenia)
const STROKE_TOL_MM = 2; // tolerancja skoku (sym., do potwierdzenia)
const Y3_PULSE_MS = 200; // czas impulsu Y3 (sym.)
const SETTLE_MS = 300; // pomiar siły resztkowej po zatrzymaniu (sym.)
const STATION_OPS_MS = 1200; // pozostałe operacje stacji i przejścia sterowania (sym.)

type SensorMode = 'ok' | 'dropout' | 'saturated';

interface Pusher {
  present: boolean;
  fault: LatchFault;
  latched: boolean;
  /** Ugięcie sprężyny [mm] względem położenia swobodnego (oparcia). */
  p: number;
  latchAttempts: number;
  /** Numer próby naciągu, w której zaczep był ostatnio sprawdzany. */
  latchTriedIn: number;
}

export interface StationSimSnapshot {
  t: number;
  stage: number;
  x: number;
  F: number | null;
  alarms: string[];
  io: Record<string, boolean>;
  latched: number;
  y3Pulses: number;
  attempts: number;
}

export class StationSim {
  readonly cfg: StationSimConfig;
  private rng: Rng;
  private simMs = 0;
  private lines: string[] = [];

  // Mechanika
  x = 0;
  private v = 0;
  private vTarget = 0;
  private pushers: Pusher[];
  private Ftrue = 0;

  // Czujnik siły
  sensorMode: SensorMode = 'ok';
  private lastSampleMs = 0;
  private lastSample: number | null = 0;
  private tare = 0;
  private sampleBuf: number[] = [];

  // Wejścia zewnętrzne (sterowane przez scenariusz lub panel symulatora)
  doorClosed = true;
  anchorPresent = true;
  stopPressed = false;
  startButton = false;

  // Wyjścia
  private M1 = false;
  private Y1 = false;
  private Y2 = false;
  private Y3 = false;
  private y1ChangedMs = -1e9;
  private y2ChangedMs = -1e9;

  // Sekwencja
  stage = 0;
  private sub = 0;
  private subMs = 0;
  alarms = new Set<string>();
  private haltFault = false;
  attempts = 0;
  private expectedN = PUSHER_COUNT;
  private x0 = 0;
  private fit = new IncrementalLineFit();
  private fpeak = 0;
  private slopeChecked = false;
  private residual = 0;
  private homing = true;
  y3Pulses = 0;
  private settleSum = 0;
  private settleN = 0;

  private lastIo = '';
  private nextLogMs = 0;

  constructor(cfg: Partial<StationSimConfig> = {}) {
    this.cfg = { ...defaultStationSimConfig(), ...cfg };
    this.rng = new Rng(this.cfg.seed);
    this.pushers = Array.from({ length: PUSHER_COUNT }, (_, i) => ({
      present: this.cfg.springsPresent[i] ?? true,
      fault: this.cfg.latchFaults[i] ?? 'ok',
      latched: false,
      p: 0,
      latchAttempts: 0,
      latchTriedIn: -1,
    }));
  }

  /** Czas sterownika [ms] wysyłany w polu t. */
  get tMs(): number {
    return this.cfg.bootOffsetMs + this.simMs;
  }

  get elapsedMs(): number {
    return this.simMs;
  }

  /** Odczyt czujnika siły [N] po tarowaniu; null przy braku próbki. */
  get Fmeas(): number | null {
    if (this.simMs - this.lastSampleMs > SENSOR_TIMEOUT_MS) return null;
    return this.lastSample === null ? null : this.lastSample - this.tare;
  }

  // ───────────── wejścia logiczne ─────────────
  private get S1() { return this.x <= 0.05; }
  private get S2() { return this.x >= X_S2 - 0.005; }
  private get S3() { return this.anchorPresent; }
  private get S4() { return this.Y1 && this.simMs - this.y1ChangedMs >= ACTUATOR_DELAY_MS; }
  private get S5() { return this.Y2 ? this.simMs - this.y2ChangedMs >= ACTUATOR_DELAY_MS : this.simMs - this.y2ChangedMs < ACTUATOR_DELAY_MS; }
  private get S6() { return this.doorClosed; }

  ioState(): Record<string, boolean> {
    return {
      S1: this.S1, S2: this.S2, S3: this.S3, S4: this.S4, S5: this.S5, S6: this.S6,
      STOP: this.stopPressed, START: this.startButton,
      M1: this.M1, Y1: this.Y1, Y2: this.Y2, Y3: this.Y3,
    };
  }

  snapshot(): StationSimSnapshot {
    return {
      t: this.tMs,
      stage: this.stage,
      x: this.x,
      F: this.Fmeas,
      alarms: [...this.alarms],
      io: this.ioState(),
      latched: this.pushers.filter((p) => p.present && p.latched).length,
      y3Pulses: this.y3Pulses,
      attempts: this.attempts,
    };
  }

  /** Liczba zaczepów zatrzaśniętych (dla oceny scenariuszy). */
  get latchedCount(): number {
    return this.pushers.filter((p) => p.present && p.latched).length;
  }

  // ───────────── wyjście tekstowe ─────────────
  private emit(line: string) {
    this.lines.push(line);
  }

  private emitIo(force = false) {
    if (!this.cfg.extensions) return;
    const io = this.ioState();
    const s = Object.entries(io).map(([k, v]) => `${k}=${v ? 1 : 0}`).join(' ');
    if (force || s !== this.lastIo) {
      this.lastIo = s;
      this.emit(`IO ${s}`);
    }
  }

  private raise(code: string, detail = '') {
    if (this.alarms.has(code)) return;
    this.alarms.add(code);
    this.emit(this.cfg.extensions ? `ALARM ${code}${detail ? ' ' + detail : ''}` : `FAULT ${code}`);
  }

  // ───────────── polecenia ─────────────
  command(raw: string) {
    const parts = raw.trim().split(/\s+/);
    const cmd = (parts[0] ?? '').toUpperCase();
    const ack = (ok: boolean, why = '') => {
      if (this.cfg.extensions) this.emit(ok ? `OK ${cmd}` : `ERR ${cmd} ${why}`.trim());
    };
    switch (cmd) {
      case 'START': {
        const why = this.startBlockReason();
        if (why) return ack(false, why);
        ack(true);
        this.attempts = 0;
        this.expectedN = PUSHER_COUNT;
        this.enter(1);
        return;
      }
      case 'RESET': {
        if (!this.S6) return ack(false, 'DOOR');
        if (this.stopPressed) return ack(false, 'STOP');
        const hadAlarms = this.alarms.size > 0;
        this.alarms.clear();
        this.haltFault = false;
        if (this.sensorMode !== 'ok') this.sensorMode = 'ok';
        this.Y3 = false;
        ack(true);
        if (hadAlarms && this.cfg.extensions) this.emit('ALARM CLEAR');
        this.enter(0);
        this.homing = true;
        return;
      }
      case 'STATUS': {
        const io = this.ioState();
        const s = Object.entries(io).map(([k, v]) => `${k}=${v ? 1 : 0}`).join(' ');
        const alarm = this.alarms.size ? [...this.alarms].join(',') : 'NONE';
        if (this.cfg.extensions) this.emit(`STATUS stan=${this.stage} ${s} x=${this.x.toFixed(2)} F=${(this.Fmeas ?? NaN).toFixed(1)} alarm=${alarm}`);
        else this.emit(`stan ${this.stage}`);
        return;
      }
      case 'DISCHARGE': {
        if (this.stage !== 6) return ack(false, 'NOT_ARMED');
        if (!this.S6) return ack(false, 'DOOR');
        if (this.haltFault) return ack(false, 'ALARM');
        ack(true);
        this.enter(8);
        return;
      }
      case 'ZERO': {
        if (this.lastSample !== null) this.tare = this.lastSample;
        return ack(true);
      }
      case 'CAL': {
        const f = Number(parts[1]);
        if (!Number.isFinite(f) || f <= 0) return ack(false, 'ARG');
        if (this.cfg.extensions) this.emit(`OK CAL ${f.toFixed(1)} k=0.00${Math.round(10000 + this.rng.gauss(20))}`);
        return;
      }
      default:
        if (this.cfg.extensions) this.emit(`ERR ${cmd || '?'} UNKNOWN`);
    }
  }

  private startBlockReason(): string | null {
    if (this.alarms.size > 0) return 'ALARM';
    if (this.stage !== 0 || this.homing) return 'BUSY';
    if (!this.S6) return 'DOOR';
    if (!this.S3) return 'NO_ANCHOR';
    if (!this.S1) return 'NOT_HOME';
    return null;
  }

  // ───────────── sekwencja ─────────────
  private enter(stage: number) {
    this.stage = stage;
    this.sub = 0;
    this.subMs = this.simMs;
    this.vTarget = 0;
    this.v = 0;
  }

  private setSub(n: number) {
    this.sub = n;
    this.subMs = this.simMs;
  }

  private motor(speed: number) {
    this.vTarget = speed;
  }

  private stopMotor() {
    this.vTarget = 0;
    this.v = 0;
  }

  private setY1(on: boolean) {
    if (this.Y1 !== on) { this.Y1 = on; this.y1ChangedMs = this.simMs; }
  }
  private setY2(on: boolean) {
    if (this.Y2 !== on) { this.Y2 = on; this.y2ChangedMs = this.simMs; }
  }

  private expectedSlope(): number {
    return (SLOPE_NOMINAL_N_PER_MM * this.expectedN) / PUSHER_COUNT;
  }

  private slopeOk(s: number): boolean {
    return Math.abs(s / this.expectedSlope() - 1) <= SLOPE_TOLERANCE;
  }

  private abortCock(code: string, detail: string) {
    this.raise(code, detail);
    this.stopMotor();
    this.enter(0);
    this.homing = true; // płyta wraca do S1 z aktywnym alarmem
  }

  private control() {
    const F = this.Fmeas;
    const moving = this.v !== 0 || this.vTarget !== 0;

    // Warunki ogólne alarmu
    if (!this.S6 && (moving || (this.stage > 0 && this.stage !== 6))) {
      if (!this.alarms.has('DOOR')) this.raise('DOOR');
    }
    if (!this.S6) {
      this.stopMotor();
      if (this.alarms.has('DOOR')) this.haltFault = true;
    }
    if (moving && this.simMs - this.lastSampleMs > SENSOR_TIMEOUT_MS) {
      this.raise('SENSOR');
      this.haltFault = true;
      this.stopMotor();
    }
    if (F !== null && F > OVERLOAD_FORCE_N) {
      this.raise('OVERLOAD', `F=${F.toFixed(0)}`);
      this.haltFault = true;
      this.stopMotor();
    }
    if (this.haltFault) {
      this.Y3 = false;
      this.M1 = false;
      return;
    }

    const since = this.simMs - this.subMs;

    switch (this.stage) {
      case 0: {
        if (this.homing) {
          if (!this.S1) this.motor(-FAST_SPEED_MM_S);
          else {
            this.stopMotor();
            this.x = 0;
            this.homing = false;
            if (this.latchedCount === 0) { this.setY1(false); this.setY2(false); }
          }
        }
        break;
      }
      case 1:
        if (this.sub === 0) { this.setY1(true); this.setSub(1); }
        else if (this.S4 && since >= ACTUATOR_DELAY_MS + STATION_OPS_MS / 2) this.enter(2);
        break;
      case 2:
        if (this.sub === 0) { this.setY2(true); this.setSub(1); }
        else if (this.S5 && since >= ACTUATOR_DELAY_MS + STATION_OPS_MS / 2) this.enter(3);
        break;
      case 3:
        if (F !== null && F > CONTACT_FORCE_N) {
          this.stopMotor();
          this.x0 = this.x;
          this.fit.reset();
          this.fpeak = 0;
          this.slopeChecked = false;
          this.enter(4);
        } else if (this.x > X_S2 + 5) {
          this.abortCock('NO_SUPPORT', 'brak oparcia');
        } else this.motor(FAST_SPEED_MM_S);
        break;
      case 4: {
        this.motor(COCK_SPEED_MM_S);
        const d = this.x - this.x0;
        if (this.newSample && F !== null) {
          if (d >= FIT_SKIP_START_MM && d <= COCK_STROKE_MM - FIT_END_MARGIN_MM) this.fit.add(d, F);
          if (d > 10) this.fpeak = Math.max(this.fpeak, this.avgForce());
        }
        if (!this.slopeChecked && d >= FIT_CHECK_MM) {
          const r = this.fit.result();
          if (r) {
            this.slopeChecked = true;
            if (!this.slopeOk(r.slope)) {
              this.abortCock('SPRING_SLOPE', `slope=${r.slope.toFixed(2)} expected=${this.expectedSlope().toFixed(2)}`);
              break;
            }
          }
        }
        if (this.S2) {
          this.stopMotor();
          const r = this.fit.result();
          if (Math.abs(d - COCK_STROKE_MM) > STROKE_TOL_MM) { this.abortCock('BAD_STROKE', `d=${d.toFixed(1)}`); break; }
          if (!r || !this.slopeOk(r.slope)) { this.abortCock('SPRING_SLOPE', `slope=${r ? r.slope.toFixed(2) : 'nan'}`); break; }
          if (Math.abs(this.fpeak / PEAK_FORCE_N - 1) > SLOPE_TOLERANCE) { this.abortCock('SPRING_FORCE', `Fpeak=${this.fpeak.toFixed(0)}`); break; }
          this.enter(5);
        }
        break;
      }
      case 5: {
        const target = X_S2 - BACKOFF_MM;
        if (this.sub === 0) {
          if (this.x > target) this.motor(-COCK_SPEED_MM_S);
          else { this.stopMotor(); this.x = target; this.setSub(1); this.settleSum = 0; this.settleN = 0; }
        } else if (this.sub === 1) {
          if (since >= SETTLE_MS / 3 && this.newSample && F !== null) { this.settleSum += F; this.settleN++; }
          if (since >= SETTLE_MS) {
            this.residual = this.settleN ? this.settleSum / this.settleN : NaN;
            this.attempts++;
            if (this.residual < RESIDUAL_FORCE_LIMIT_N) this.enter(6);
            else if (this.attempts < MAX_COCK_ATTEMPTS) {
              this.expectedN = Math.min(PUSHER_COUNT, Math.max(1, Math.round(this.residual / RESIDUAL_ONE_LATCH_N)));
              this.enter(7);
            } else {
              this.raise('ARM_FAILED', `Fres=${this.residual.toFixed(0)}`);
              this.enter(8);
            }
          }
        }
        break;
      }
      case 6:
        if (!this.S1) this.motor(-FAST_SPEED_MM_S);
        else { this.stopMotor(); this.x = 0; }
        break;
      case 7:
        if (!this.S1) this.motor(-FAST_SPEED_MM_S);
        else { this.stopMotor(); this.x = 0; this.enter(3); }
        break;
      case 8:
        this.discharge(F, since);
        break;
    }
    this.M1 = this.v !== 0 || this.vTarget !== 0;
  }

  /** Etap 8: kontrolowane rozładowanie (podrozdział 6.6, 7.10.4). */
  private discharge(F: number | null, since: number) {
    switch (this.sub) {
      case 0: // dojazd do oparcia: szybko do wykrycia siły, potem wolno do S2
        if (this.S2) { this.stopMotor(); this.setSub(1); }
        else this.motor(F !== null && F > CONTACT_FORCE_N ? COCK_SPEED_MM_S : FAST_SPEED_MM_S);
        break;
      case 1: // sprawdzenie podparcia
        if (F === null || F < CONTACT_FORCE_N) {
          this.raise('NO_SUPPORT', `F=${F === null ? 'nan' : F.toFixed(0)}`);
          this.enter(0);
          this.homing = true;
        } else { this.setY2(false); this.setSub(2); }
        break;
      case 2: // wysunięcie zawleczki
        if (!this.S5 && since >= ACTUATOR_DELAY_MS) {
          // Blokada Y3: osłona, kotwica zaciśnięta, zawleczka wysunięta, S2, siła podparcia, etap 8
          if (this.S6 && this.S4 && !this.S5 && this.S2 && F !== null && F >= CONTACT_FORCE_N) {
            this.Y3 = true;
            this.y3Pulses++;
            for (const p of this.pushers) p.latched = false;
            this.setSub(3);
          } else {
            this.raise('NO_SUPPORT');
            this.enter(0);
            this.homing = true;
          }
        }
        break;
      case 3:
        if (since >= Y3_PULSE_MS) { this.Y3 = false; this.setSub(4); }
        break;
      case 4: // wolne cofanie do zwolnienia sprężyn
        if (this.x > X_CONTACT - 1) this.motor(-COCK_SPEED_MM_S);
        else this.setSub(5);
        break;
      case 5:
        if (!this.S1) this.motor(-FAST_SPEED_MM_S);
        else {
          this.stopMotor();
          this.x = 0;
          this.setY1(false);
          this.enter(0);
          this.homing = false;
        }
        break;
    }
  }

  // ───────────── mechanika ─────────────
  private newSample = false;

  private avgForce(): number {
    const b = this.sampleBuf;
    if (b.length === 0) return 0;
    return b.reduce((a, c) => a + c, 0) / b.length;
  }

  private physics(dtMs: number) {
    const dt = dtMs / 1000;
    if (!this.S6) this.v = 0; // przekaźnik K1 odcina napęd niezależnie od programu
    if (this.vTarget === 0) this.v = 0;
    else if (this.v !== this.vTarget) {
      const dv = ACCEL * dt;
      if (Math.abs(this.vTarget - this.v) <= dv) this.v = this.vTarget;
      else this.v += Math.sign(this.vTarget - this.v) * dv;
      if (Math.sign(this.v) !== Math.sign(this.vTarget) && this.v !== 0) this.v = Math.sign(this.vTarget) * dv;
    }
    this.x = Math.max(0, Math.min(X_S2, this.x + this.v * dt));

    // Siły w kontaktach pręt–popychacz
    const r = this.x - X_CONTACT;
    let F = 0;
    for (const p of this.pushers) {
      if (!p.present) continue;
      const seat = p.latched ? P_LATCH : 0;
      const delta = r - seat;
      if (delta <= 0) {
        if (!p.latched) p.p = 0;
        continue;
      }
      const fSeat = PRE + KS * seat;
      let f: number;
      if (K_CONTACT * delta <= fSeat) {
        f = K_CONTACT * delta;
        p.p = seat;
      } else {
        p.p = (K_CONTACT * r - PRE) / (K_CONTACT + KS);
        f = K_CONTACT * (r - p.p);
      }
      F += f;
      // Zatrzaśnięcie zaczepu po osiągnięciu położenia zaczepu
      if (!p.latched && p.p >= P_LATCH && this.stage === 4 && p.latchTriedIn !== this.attempts) {
        p.latchTriedIn = this.attempts;
        p.latchAttempts++;
        const ok = p.fault === 'ok' || (p.fault === 'transient' && p.latchAttempts > 1);
        if (ok) p.latched = true;
      }
    }
    this.Ftrue = F;

    // Czujnik siły
    this.newSample = false;
    if (this.simMs - this.lastSampleMs >= SENSOR_PERIOD_MS) {
      if (this.sensorMode === 'ok') {
        this.lastSample = this.Ftrue + this.rng.gauss(this.cfg.noiseN);
        this.lastSampleMs = this.simMs;
        this.newSample = true;
      } else if (this.sensorMode === 'saturated') {
        this.lastSample = 2047;
        this.lastSampleMs = this.simMs;
        this.newSample = true;
      }
      if (this.newSample && this.lastSample !== null) {
        this.sampleBuf.push(this.lastSample - this.tare);
        if (this.sampleBuf.length > 8) this.sampleBuf.shift();
      }
    }
  }

  /** Jeden krok symulacji (pętla sterowania co 1 ms). */
  step() {
    this.simMs += 1;
    this.physics(1);
    this.control();
    if (this.simMs >= this.nextLogMs) {
      this.nextLogMs = this.simMs + STATION_LOG_PERIOD_MS;
      const F = this.Fmeas;
      this.emitIo();
      this.emit(`${this.tMs}, ${this.stage}, ${this.x.toFixed(2)}, ${F === null ? 'nan' : F.toFixed(1)}`);
    }
  }

  /** Przesuwa czas symulacji o `ms` i zwraca wygenerowane wiersze. */
  advance(ms: number, onStep?: (sim: StationSim) => void): string[] {
    const n = Math.max(0, Math.round(ms));
    for (let i = 0; i < n; i++) {
      this.step();
      onStep?.(this);
    }
    return this.drain();
  }

  drain(): string[] {
    const out = this.lines;
    this.lines = [];
    return out;
  }

  /** Wiersz powitalny po otwarciu portu (firmware wysyła nagłówek LOG). */
  hello(): string[] {
    this.emit('t, stan, x, F');
    this.emitIo(true);
    return this.drain();
  }

  /** Położenie płyty względem oparcia [mm] (dla scenariuszy). */
  get strokeFromContact(): number {
    return this.x - X_CONTACT;
  }
}

export const STATION_SIM_GEOMETRY = { X_CONTACT, X_S2, P_LATCH, K_CONTACT, KS, PRE } as const;
