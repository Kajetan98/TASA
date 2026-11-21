import { BaseTransport } from './Transport';

/** Urządzenie symulowane: generuje linie tekstowe jak sprzęt i przyjmuje polecenia. */
export interface SimDevice {
  readonly name: string;
  hello(): string[];
  advance(ms: number): string[];
  command(line: string): void;
}

/**
 * Transport podłączony do symulatora. Linie przechodzą przez ten sam parser co dane ze sprzętu.
 * `speed` przyspiesza czas symulacji; `linkPaused` wstrzymuje wysyłanie (test utraty łączności),
 * a symulator w tym czasie działa dalej.
 */
export class SimulatorTransport extends BaseTransport {
  readonly kind = 'simulator' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  speed = 1;
  linkPaused = false;

  constructor(readonly device: SimDevice, private readonly tickMs = 20) {
    super();
  }

  get label(): string {
    return `symulator: ${this.device.name}`;
  }

  async connect(): Promise<void> {
    this.h.onStatus('connected', this.label);
    this.emit(this.device.hello());
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  private tick() {
    const now = performance.now();
    const realMs = Math.min(500, now - this.last);
    this.last = now;
    const lines = this.device.advance(realMs * this.speed);
    if (!this.linkPaused) this.emit(lines);
  }

  private emit(lines: string[]) {
    if (lines.length) this.h.onData(lines.join('\n') + '\n');
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.h.onStatus('disconnected');
  }

  async write(line: string): Promise<void> {
    if (this.linkPaused) return; // przy przerwanym łączu polecenie nie dociera
    this.device.command(line);
  }
}
