import { ANCHOR_LIVE_CHART_S } from '../config/tasa';
import type { CapturedActivation } from '../domain/activation';
import { ActivationRecorder } from '../domain/activation';
import { tiltFromAcc } from '../domain/anchorState';
import type { AnchorFrame, HelloFrame, StatusFrame, TelemetryFrame } from '../protocol/anchorFrames';
import { anchorCommand, parseAnchorLine } from '../protocol/anchorFrames';
import { SourceEngine } from './sourceEngine';

/** Źródło A: moduł pomiarowy kotwicy. */
export class AnchorEngine extends SourceEngine {
  tel: TelemetryFrame | null = null;
  telAt: number | null = null;
  statusFrame: StatusFrame | null = null;
  hello: HelloFrame | null = null;
  seqGaps = 0;
  private lastSeq: number | null = null;
  /** Wykres na żywo: czas µC [s], przyspieszenie osiowe [g], przechył [°]. */
  liveT: number[] = [];
  liveAz: number[] = [];
  liveTilt: (number | null)[] = [];
  liveVersion = 0;
  recorder = new ActivationRecorder();
  onActivation: ((c: CapturedActivation) => void) | null = null;
  lastEvents: AnchorFrame[] = [];

  protected onReset(): void {
    this.tel = null;
    this.telAt = null;
    this.statusFrame = null;
    this.hello = null;
    this.lastSeq = null;
    this.liveT = [];
    this.liveAz = [];
    this.liveTilt = [];
    this.recorder.reset();
  }

  protected handleLine(line: string): boolean {
    const r = parseAnchorLine(line);
    if (!r.ok) {
      this.log('error', `${r.error}: ${line.slice(0, 160)}`);
      return false;
    }
    const f = r.frame;
    if (f.seq !== null) {
      if (this.lastSeq !== null && f.seq !== ((this.lastSeq + 1) >>> 0) && f.seq > this.lastSeq) this.seqGaps += f.seq - this.lastSeq - 1;
      this.lastSeq = f.seq;
    }
    switch (f.type) {
      case 'telemetry': {
        this.tel = f;
        this.telAt = performance.now();
        const t = f.t_us / 1e6;
        this.liveT.push(t);
        this.liveAz.push(f.acc ? f.acc[2] : NaN);
        this.liveTilt.push(f.tilt ?? (f.acc ? tiltFromAcc(f.acc) : null));
        const horizon = t - ANCHOR_LIVE_CHART_S;
        let cut = 0;
        while (cut < this.liveT.length && this.liveT[cut] < horizon) cut++;
        if (cut > 0) {
          this.liveT.splice(0, cut);
          this.liveAz.splice(0, cut);
          this.liveTilt.splice(0, cut);
        }
        this.liveVersion++;
        break;
      }
      case 'status':
        this.statusFrame = f;
        break;
      case 'hello':
        this.hello = f;
        this.log('rx', line);
        break;
      case 'event':
        this.lastEvents.push(f);
        if (this.lastEvents.length > 60) this.lastEvents.shift();
        this.log('rx', line);
        break;
      case 'ack':
        this.log('rx', line);
        break;
      case 'window':
        break;
    }
    const cap = this.recorder.push(f, performance.now());
    if (cap) this.onActivation?.(cap);
    return true;
  }

  async disconnect(): Promise<void> {
    this.recorder.cancel();
    await super.disconnect();
  }

  /** Wywoływane cyklicznie: zamyka rejestrację po limicie oczekiwania na okno. */
  tick(): void {
    const cap = this.recorder.tick(performance.now());
    if (cap) {
      this.version++;
      this.onActivation?.(cap);
    }
  }

  get capturing(): boolean {
    return this.recorder.capturing;
  }

  async send(cmd: 'hello' | 'status' | 'rearm' | 'ping'): Promise<void> {
    await this.writeLine(anchorCommand(cmd));
  }
}
