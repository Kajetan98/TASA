/** Wspólny interfejs transportu. Transport przekazuje fragmenty tekstu; linie składa LineSplitter. */

export type TransportKind = 'serial' | 'bluetooth' | 'websocket' | 'simulator';
export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TransportHandlers {
  onData: (text: string) => void;
  onStatus: (status: TransportStatus, detail?: string) => void;
}

export interface Transport {
  readonly kind: TransportKind;
  /** Opis połączenia do wyświetlenia (np. nazwa urządzenia BLE, adres WebSocket). */
  readonly label: string;
  setHandlers(h: TransportHandlers): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Wysyła jedną linię (transport dodaje zakończenie linii). */
  write(line: string): Promise<void>;
}

export abstract class BaseTransport implements Transport {
  abstract readonly kind: TransportKind;
  abstract readonly label: string;
  protected h: TransportHandlers = { onData: () => {}, onStatus: () => {} };

  setHandlers(h: TransportHandlers): void {
    this.h = h;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract write(line: string): Promise<void>;
}

export const transportKindLabel: Record<TransportKind, string> = {
  serial: 'USB (Web Serial)',
  bluetooth: 'Bluetooth LE',
  websocket: 'WebSocket',
  simulator: 'Symulator',
};

export const isWebSerialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;
export const isWebBluetoothSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;
