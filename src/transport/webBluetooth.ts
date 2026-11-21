import { BLE_NAME_PREFIX, BLE_NUS_RX, BLE_NUS_SERVICE, BLE_NUS_TX, BLE_WRITE_CHUNK } from '../config/tasa';
import { BaseTransport } from './Transport';

/**
 * Bluetooth LE przez Web Bluetooth (Chrome/Edge). Profil Nordic UART Service na XIAO ESP32-S3:
 * TX (notify) moduł → aplikacja, RX (write) aplikacja → moduł. Linie mogą być dzielone
 * na kilka powiadomień; składa je LineSplitter.
 */
export class WebBluetoothTransport extends BaseTransport {
  readonly kind = 'bluetooth' as const;
  label = 'Bluetooth LE';
  private device: BluetoothDevice | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private decoder = new TextDecoder();
  private manual = false;

  private onNotify = (ev: Event) => {
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    if (ch.value) this.h.onData(this.decoder.decode(ch.value, { stream: true }));
  };

  private onDisconnected = () => {
    this.rx = this.tx = null;
    this.h.onStatus(this.manual ? 'disconnected' : 'error', this.manual ? undefined : 'Połączenie Bluetooth zerwane (zasięg, zasilanie modułu lub ekranowanie obudowy).');
  };

  async connect(): Promise<void> {
    if (!('bluetooth' in navigator)) throw new Error('Przeglądarka nie obsługuje Web Bluetooth. Użyj Chrome lub Edge (na Linuksie włącz flagę Web Bluetooth).');
    this.h.onStatus('connecting');
    this.manual = false;
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: BLE_NAME_PREFIX }, { services: [BLE_NUS_SERVICE] }],
        optionalServices: [BLE_NUS_SERVICE],
      });
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      const server = await device.gatt!.connect();
      const svc = await server.getPrimaryService(BLE_NUS_SERVICE);
      this.tx = await svc.getCharacteristic(BLE_NUS_TX);
      this.rx = await svc.getCharacteristic(BLE_NUS_RX);
      this.decoder = new TextDecoder();
      this.tx.addEventListener('characteristicvaluechanged', this.onNotify);
      await this.tx.startNotifications();
      this.label = `${device.name ?? 'urządzenie BLE'} (Nordic UART)`;
      this.h.onStatus('connected', this.label);
    } catch (e) {
      this.h.onStatus('error', e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.manual = true;
    try {
      this.tx?.removeEventListener('characteristicvaluechanged', this.onNotify);
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } finally {
      this.h.onStatus('disconnected');
    }
  }

  async write(line: string): Promise<void> {
    if (!this.rx) throw new Error('Brak połączenia Bluetooth');
    const bytes = new TextEncoder().encode(line + '\n');
    for (let i = 0; i < bytes.length; i += BLE_WRITE_CHUNK) {
      const part = bytes.slice(i, i + BLE_WRITE_CHUNK);
      if (this.rx.properties.writeWithoutResponse) await this.rx.writeValueWithoutResponse(part);
      else await this.rx.writeValueWithResponse(part);
    }
  }
}
