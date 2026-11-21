import { BaseTransport } from './Transport';

/** WebSocket dla mostka radiowego lub przyszłego mostka Python (linie tekstowe w wiadomościach). */
export class WebSocketTransport extends BaseTransport {
  readonly kind = 'websocket' as const;
  private ws: WebSocket | null = null;
  private manual = false;

  constructor(private readonly url: string, private readonly lineEnding = '\n') {
    super();
  }

  get label(): string {
    return this.url;
  }

  connect(): Promise<void> {
    this.h.onStatus('connecting');
    this.manual = false;
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        this.h.onStatus('error', e instanceof Error ? e.message : String(e));
        reject(e);
        return;
      }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const decoder = new TextDecoder();
      ws.onopen = () => {
        this.h.onStatus('connected', this.url);
        resolve();
      };
      ws.onerror = () => {
        this.h.onStatus('error', `Nie można połączyć z ${this.url}`);
        reject(new Error(`Nie można połączyć z ${this.url}`));
      };
      ws.onclose = () => {
        if (!this.manual) this.h.onStatus('error', 'Połączenie WebSocket zamknięte przez serwer');
        else this.h.onStatus('disconnected');
      };
      ws.onmessage = (ev) => {
        const d = ev.data;
        let text = typeof d === 'string' ? d : decoder.decode(d as ArrayBuffer, { stream: true });
        // Wiadomość bez zakończenia linii traktowana jako jedna pełna linia.
        if (!text.endsWith('\n')) text += '\n';
        this.h.onData(text);
      };
    });
  }

  async disconnect(): Promise<void> {
    this.manual = true;
    this.ws?.close();
    this.ws = null;
  }

  async write(line: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('WebSocket nie jest połączony');
    this.ws.send(line + this.lineEnding);
  }
}
