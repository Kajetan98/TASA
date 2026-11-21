import { KNOWN_ALARM_CODES } from '../domain/alarms';

/** Wiersze sterownika stacji uzbrajania (docs/protokol.md, część B). */

export const IO_KEYS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'STOP', 'START', 'M1', 'Y1', 'Y2', 'Y3'] as const;
export type IoKey = (typeof IO_KEYS)[number];
export type IoValues = Partial<Record<IoKey, boolean>>;

export type StationLine =
  | { kind: 'log'; t: number; stage: number; x: number; F: number | null }
  | { kind: 'header' }
  | { kind: 'io'; io: IoValues; stage: number | null; alarm: string | null; isStatus: boolean }
  | { kind: 'alarm'; codes: string[]; text: string }
  | { kind: 'alarmClear'; text: string }
  | { kind: 'ack'; ok: boolean; command: string; text: string }
  | { kind: 'text'; text: string };

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const NAN_TOKENS = new Set(['nan', '-nan', 'NaN', 'NAN', 'inf', '-inf', '']);

function splitLog(line: string): string[] {
  const s = line.trim();
  if (/[,;\t]/.test(s)) return s.split(/\s*[,;\t]\s*/);
  return s.split(/\s+/);
}

function parseLog(line: string): StationLine | null {
  const f = splitLog(line);
  if (f.length !== 4) return null;
  const [ts, ss, xs, fs] = f;
  if (!NUM.test(ts) || !NUM.test(ss) || !NUM.test(xs)) return null;
  const stage = Number(ss);
  if (!Number.isInteger(stage)) return null;
  let F: number | null;
  if (NUM.test(fs)) F = Number(fs);
  else if (NAN_TOKENS.has(fs)) F = null;
  else return null;
  return { kind: 'log', t: Number(ts), stage, x: Number(xs), F };
}

const KV = /([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^\s,;]+)/g;

function parseBool(v: string): boolean | null {
  if (v === '1' || /^(on|true|hi|high)$/i.test(v)) return true;
  if (v === '0' || /^(off|false|lo|low)$/i.test(v)) return false;
  return null;
}

/** Rozpoznaje wiersz wejść/wyjść lub stanu (IO / STATUS albo co najmniej dwa znane klucze). */
function parseIo(line: string): StationLine | null {
  const trimmed = line.trim();
  const head = trimmed.split(/\s+/)[0]?.toUpperCase() ?? '';
  const io: IoValues = {};
  let stage: number | null = null;
  let alarm: string | null = null;
  let known = 0;
  for (const m of trimmed.matchAll(KV)) {
    const key = m[1].toUpperCase();
    const val = m[2];
    if ((IO_KEYS as readonly string[]).includes(key)) {
      const b = parseBool(val);
      if (b !== null) {
        io[key as IoKey] = b;
        known++;
      }
    } else if (key === 'STAN' || key === 'ETAP' || key === 'STAGE' || key === 'STATE') {
      const n = Number(val);
      if (Number.isInteger(n)) stage = n;
    } else if (key === 'ALARM' || key === 'FAULT') {
      alarm = val.toUpperCase();
    }
  }
  const isStatus = head === 'STATUS';
  if (head === 'IO' || isStatus || known >= 2) {
    return { kind: 'io', io, stage, alarm, isStatus };
  }
  return null;
}

const CLEAR_WORDS = new Set(['NONE', 'CLEAR', 'CLEARED', 'OK', 'BRAK']);

/** Parsuje jeden wiersz tekstowy ze sterownika stacji. */
export function parseStationLine(line: string): StationLine {
  const text = line.trim();
  const log = parseLog(text);
  if (log) return log;
  if (/^t\s*[,;\t]\s*(stan|stage|state)\b/i.test(text)) return { kind: 'header' };

  const io = parseIo(text);
  if (io) return io;

  const words = text.split(/[\s,;:=()[\]]+/).filter(Boolean);
  const upper = words.map((w) => w.toUpperCase());

  if (upper[0] === 'ALARM' && upper[1] && CLEAR_WORDS.has(upper[1])) return { kind: 'alarmClear', text };

  // Potwierdzenia przed alarmami: "ERR START DOOR" to odmowa wykonania, nie zgłoszenie alarmu.
  if (upper[0] === 'OK' || upper[0] === 'ERR' || upper[0] === 'ERROR') {
    return { kind: 'ack', ok: upper[0] === 'OK', command: upper[1] ?? '', text };
  }

  const codes = upper.filter((w) => (KNOWN_ALARM_CODES as readonly string[]).includes(w));
  if (codes.length > 0) return { kind: 'alarm', codes: [...new Set(codes)], text };
  if (upper[0] === 'ALARM' && upper[1] && /^[A-Z][A-Z0-9_]+$/.test(upper[1])) return { kind: 'alarm', codes: [upper[1]], text };

  return { kind: 'text', text };
}

/** Wykrywa jednostkę pola t z mediany odstępów kolejnych wierszy LOG. */
export function detectTimeUnit(times: number[]): 'ms' | 's' | null {
  if (times.length < 3) return null;
  const d: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const dt = times[i] - times[i - 1];
    if (dt > 0) d.push(dt);
  }
  if (d.length < 2) return null;
  d.sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  return med > 1 ? 'ms' : 's';
}
