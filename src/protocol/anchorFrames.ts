import { PUSHER_COUNT } from '../config/tasa';

/** Ramki modułu pomiarowego kotwicy, protokół w wersji 1 (docs/protokol.md, część A). */

interface FrameBase {
  /** Licznik ramek; null, gdy moduł go nie wysłał. */
  seq: number | null;
  /** Czas mikrokontrolera [µs]; w ramce event: czas zbocza. */
  t_us: number;
}

export interface TelemetryFrame extends FrameBase {
  type: 'telemetry';
  /** Przyspieszenie [x, y, z] w g; z w osi urządzenia. */
  acc: [number, number, number] | null;
  /** Przechył wyznaczony w firmware [°]; null, gdy brak. */
  tilt: number | null;
  /** Maska czujników START (bit 0 = P1). */
  hs: number;
  /** Maska czujników KONIEC (bit 0 = P1). */
  he: number;
  disk: 0 | 1;
  /** Zawleczka: 1 obecna, 0 usunięta, null brak czujnika. */
  pin: 0 | 1 | null;
}

export type EventSource = 'hall' | 'disk' | 'imu_peak' | 'pin';

export interface EventFrame extends FrameBase {
  type: 'event';
  src: EventSource;
  /** Kanał 1–6 dla src = hall. */
  ch: number | null;
  pos: 'start' | 'end' | null;
  val: number;
}

export interface StatusFrame extends FrameBase {
  type: 'status';
  vbat: number | null;
  rssi: number | null;
  fw: string | null;
  err: number;
  cap: 0 | 1 | null;
}

export interface WindowFrame extends FrameBase {
  type: 'window';
  id: number;
  ch: string;
  t0_us: number;
  dt_us: number;
  n: number;
  i: number;
  v: number[];
}

export interface HelloFrame extends FrameBase {
  type: 'hello';
  dev: string | null;
  fw: string | null;
  proto: number | null;
  tel_hz: number | null;
  win_hz: number | null;
  pre_ms: number | null;
  post_ms: number | null;
}

export interface AckFrame extends FrameBase {
  type: 'ack';
  cmd: string;
  ok: boolean;
  id: number | null;
}

export type AnchorFrame = TelemetryFrame | EventFrame | StatusFrame | WindowFrame | HelloFrame | AckFrame;

export type AnchorParseResult =
  | { ok: true; frame: AnchorFrame }
  | { ok: false; error: string; line: string };

const MASK_MAX = (1 << PUSHER_COUNT) - 1;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const optNum = (v: unknown): number | null => (isNum(v) ? v : null);
const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function fail(error: string, line: string): AnchorParseResult {
  return { ok: false, error, line };
}

/** Parsuje jedną linię JSON z modułu kotwicy. */
export function parseAnchorLine(line: string): AnchorParseResult {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return fail('niepoprawny JSON', line);
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return fail('ramka nie jest obiektem JSON', line);
  const r = o as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string') return fail('brak pola type', line);
  if (!isInt(r.t_us) || r.t_us < 0) return fail('brak lub niepoprawne pole t_us', line);
  const seq = isInt(r.seq) && r.seq >= 0 ? r.seq : null;
  const base = { seq, t_us: r.t_us };

  switch (type) {
    case 'telemetry': {
      let acc: [number, number, number] | null = null;
      if (r.acc !== undefined) {
        if (!Array.isArray(r.acc) || r.acc.length !== 3 || !r.acc.every(isNum)) return fail('pole acc musi być tablicą 3 liczb', line);
        acc = [r.acc[0], r.acc[1], r.acc[2]];
      }
      if (!isInt(r.hs) || r.hs < 0 || r.hs > MASK_MAX) return fail('niepoprawna maska hs', line);
      if (!isInt(r.he) || r.he < 0 || r.he > MASK_MAX) return fail('niepoprawna maska he', line);
      if (r.disk !== 0 && r.disk !== 1) return fail('pole disk musi mieć wartość 0 lub 1', line);
      let pin: 0 | 1 | null = null;
      if (r.pin !== undefined && r.pin !== null) {
        if (r.pin !== 0 && r.pin !== 1) return fail('pole pin musi mieć wartość 0 lub 1', line);
        pin = r.pin;
      }
      return {
        ok: true,
        frame: { type, ...base, acc, tilt: optNum(r.tilt), hs: r.hs, he: r.he, disk: r.disk, pin },
      };
    }
    case 'event': {
      const src = r.src;
      if (src !== 'hall' && src !== 'disk' && src !== 'imu_peak' && src !== 'pin') return fail('nieznane źródło zdarzenia', line);
      if (!isNum(r.val)) return fail('brak pola val', line);
      let ch: number | null = null;
      let pos: 'start' | 'end' | null = null;
      if (src === 'hall') {
        if (!isInt(r.ch) || r.ch < 1 || r.ch > PUSHER_COUNT) return fail(`pole ch musi mieć wartość 1–${PUSHER_COUNT}`, line);
        if (r.pos !== 'start' && r.pos !== 'end') return fail('pole pos musi mieć wartość start lub end', line);
        if (r.val !== 0 && r.val !== 1) return fail('pole val czujnika Halla musi mieć wartość 0 lub 1', line);
        ch = r.ch;
        pos = r.pos;
      }
      if ((src === 'disk' || src === 'pin') && r.val !== 0 && r.val !== 1) return fail('pole val musi mieć wartość 0 lub 1', line);
      return { ok: true, frame: { type, ...base, src, ch, pos, val: r.val } };
    }
    case 'status': {
      const cap = r.cap === 0 || r.cap === 1 ? r.cap : null;
      return {
        ok: true,
        frame: { type, ...base, vbat: optNum(r.vbat), rssi: optNum(r.rssi), fw: optStr(r.fw), err: isInt(r.err) ? r.err : 0, cap },
      };
    }
    case 'window': {
      if (!isInt(r.id)) return fail('brak pola id', line);
      if (typeof r.ch !== 'string') return fail('brak pola ch', line);
      if (!isInt(r.t0_us)) return fail('brak pola t0_us', line);
      if (!isNum(r.dt_us) || r.dt_us <= 0) return fail('niepoprawne pole dt_us', line);
      if (!isInt(r.n) || r.n <= 0) return fail('niepoprawne pole n', line);
      if (!isInt(r.i) || r.i < 0) return fail('niepoprawne pole i', line);
      if (!Array.isArray(r.v) || !r.v.every(isNum)) return fail('pole v musi być tablicą liczb', line);
      if (r.i + r.v.length > r.n) return fail('porcja wykracza poza n', line);
      return {
        ok: true,
        frame: { type, ...base, id: r.id, ch: r.ch, t0_us: r.t0_us, dt_us: r.dt_us, n: r.n, i: r.i, v: r.v as number[] },
      };
    }
    case 'hello':
      return {
        ok: true,
        frame: {
          type,
          ...base,
          dev: optStr(r.dev),
          fw: optStr(r.fw),
          proto: optNum(r.proto),
          tel_hz: optNum(r.tel_hz),
          win_hz: optNum(r.win_hz),
          pre_ms: optNum(r.pre_ms),
          post_ms: optNum(r.post_ms),
        },
      };
    case 'ack':
      return {
        ok: true,
        frame: { type, ...base, cmd: typeof r.cmd === 'string' ? r.cmd : '', ok: r.ok !== false, id: isInt(r.id) ? r.id : null },
      };
    default:
      return fail(`nieznany typ ramki: ${type}`, line);
  }
}

/** Polecenie do modułu kotwicy (jedna linia JSON). */
export function anchorCommand(cmd: 'hello' | 'status' | 'rearm' | 'ping', id?: number): string {
  return JSON.stringify(id === undefined ? { cmd } : { cmd, id });
}

/** Bit popychacza Pn (n = 1..6) w masce. */
export const pusherBit = (mask: number, n: number): boolean => ((mask >> (n - 1)) & 1) === 1;
