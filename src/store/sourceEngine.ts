import { LINK_TIMEOUT_MS } from '../config/tasa';
import { LineSplitter } from '../protocol/lineSplitter';
import type { Transport, TransportStatus } from '../transport/Transport';

export interface ConsoleLine {
  dir: 'rx' | 'tx' | 'info' | 'error';
  text: string;
  at: number; // Date.now()
}

/** Część wspólna źródeł danych: transport, składanie linii, konsola, wiek ostatniej ramki. */
export abstract class SourceEngine {
  transport: Transport | null = null;
  status: TransportStatus = 'disconnected';
  statusDetail = '';
  lastFrameAt: number | null = null; // performance.now()
  frames = 0;
  parseErrors = 0;
  console: ConsoleLine[] = [];
  version = 0;
  private splitter = new LineSplitter(8192);

  protected abstract handleLine(line: string): boolean;
  protected abstract onReset(): void;

  protected log(dir: ConsoleLine['dir'], text: string) {
    this.console.push({ dir, text, at: Date.now() });
    if (this.console.length > 400) this.console.splice(0, this.console.length - 400);
  }

  async connect(t: Transport): Promise<void> {
    if (this.transport) await this.disconnect();
    this.transport = t;
    this.splitter.reset();
    this.lastFrameAt = null;
    this.onReset();
    t.setHandlers({
      onData: (text) => this.onData(text),
      onStatus: (s, d) => {
        this.status = s;
        this.statusDetail = d ?? '';
        this.log(s === 'error' ? 'error' : 'info', `${statusText[s]}${d ? ': ' + d : ''}`);
        this.version++;
      },
    });
    try {
      await t.connect();
    } catch (e) {
      this.status = 'error';
      this.statusDetail = e instanceof Error ? e.message : String(e);
      this.transport = null;
      this.version++;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    const t = this.transport;
    this.transport = null;
    if (t) await t.disconnect();
    this.status = 'disconnected';
    this.version++;
  }

  private onData(text: string) {
    const lines = this.splitter.push(text);
    for (const l of lines) {
      const ok = this.handleLine(l);
      if (ok) {
        this.frames++;
        this.lastFrameAt = performance.now();
      } else this.parseErrors++;
    }
    if (lines.length) this.version++;
  }

  /** Wiek ostatniej ramki [ms]; null, gdy nie odebrano żadnej. */
  age(now = performance.now()): number | null {
    return this.lastFrameAt === null ? null : now - this.lastFrameAt;
  }

  /** Łącze aktywne: połączone i ostatnia ramka młodsza niż limit. */
  linkOk(now = performance.now()): boolean {
    const a = this.age(now);
    return this.status === 'connected' && a !== null && a <= LINK_TIMEOUT_MS;
  }

  async writeLine(line: string): Promise<void> {
    if (!this.transport) throw new Error('Brak połączenia');
    this.log('tx', line);
    this.version++;
    await this.transport.write(line);
  }
}

const statusText: Record<TransportStatus, string> = {
  disconnected: 'Rozłączono',
  connecting: 'Łączenie',
  connected: 'Połączono',
  error: 'Błąd połączenia',
};
