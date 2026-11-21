import { BaseTransport } from './Transport';

/** Port szeregowy przez Web Serial API (Chrome/Edge, kontekst bezpieczny: https lub localhost). */
export class WebSerialTransport extends BaseTransport {
  readonly kind = 'serial' as const;
  label = 'port szeregowy';
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private closing = false;

  constructor(private readonly baudRate: number, private readonly lineEnding = '\n') {
    super();
  }

  async connect(): Promise<void> {
    if (!('serial' in navigator)) throw new Error('Przeglądarka nie obsługuje Web Serial API. Użyj Chrome lub Edge.');
    this.h.onStatus('connecting');
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: this.baudRate });
      this.port = port;
      const info = port.getInfo();
      this.label = info.usbVendorId !== undefined
        ? `USB ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}, ${this.baudRate} b/s`
        : `port szeregowy, ${this.baudRate} b/s`;
      this.closing = false;
      this.h.onStatus('connected', this.label);
      void this.readLoop();
    } catch (e) {
      this.h.onStatus('error', e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  private async readLoop() {
    const decoder = new TextDecoder();
    while (this.port?.readable && !this.closing) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) this.h.onData(decoder.decode(value, { stream: true }));
        }
      } catch (e) {
        if (!this.closing) this.h.onStatus('error', `Błąd odczytu portu: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
    if (!this.closing) this.h.onStatus('disconnected', 'Port zamknięty przez urządzenie');
  }

  async disconnect(): Promise<void> {
    this.closing = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* port już zamknięty */
    }
    try {
      await this.port?.close();
    } catch {
      /* port już zamknięty */
    }
    this.port = null;
    this.h.onStatus('disconnected');
  }

  async write(line: string): Promise<void> {
    if (!this.port?.writable) throw new Error('Port nie jest otwarty');
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(line + this.lineEnding));
    } finally {
      writer.releaseLock();
    }
  }
}
