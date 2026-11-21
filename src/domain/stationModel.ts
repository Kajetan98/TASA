import { STATION_TIME_UNIT } from '../config/tasa';
import type { IoValues, StationLine } from '../protocol/stationFrames';
import { detectTimeUnit } from '../protocol/stationFrames';
import type { StationObservation } from '../sim/stationScenarios';
import type { StationAlarmEntry, StationCycle, StationRow } from './stationAnalysis';
import { CycleRecorder } from './stationAnalysis';

export interface StationConsumeResult {
  rows: StationRow[];
  alarms: StationAlarmEntry[];
  closedCycles: StationCycle[];
  text: string | null;
}

/**
 * Stan stacji wyznaczany wyłącznie z odebranych wierszy. Nie odtwarza wejść z numeru etapu
 * i nie zakłada skutków wysłanych poleceń.
 */
export class StationModel {
  unit: 'ms' | 's' | null = STATION_TIME_UNIT === 'auto' ? null : STATION_TIME_UNIT;
  private pendingRaw: { t: number; stage: number; x: number; F: number | null }[] = [];
  lastRow: StationRow | null = null;
  io: IoValues = {};
  ioAtT: number | null = null;
  /** Aktywne alarmy według sterownika (STATUS alarm=, ALARM CLEAR); null = nieznane. */
  activeAlarms: string[] | null = null;
  alarms: StationAlarmEntry[] = [];
  /** Alarmy zgłoszone od ostatniego wyzerowania liczników (np. początek scenariusza). */
  alarmsSeen = new Set<string>();
  y3Pulses = 0;
  private lastY3: boolean | null = null;
  /** Czas sterownika [s] ostatniego ruchu płyty (zmiana x). */
  lastMoveT: number | null = null;
  readonly cycles = new CycleRecorder();

  /** Czas [s] wiersza LOG po przeliczeniu jednostki. */
  private toSeconds(t: number): number {
    return this.unit === 'ms' ? t / 1000 : t;
  }

  consume(line: StationLine): StationConsumeResult {
    const res: StationConsumeResult = { rows: [], alarms: [], closedCycles: [], text: null };
    switch (line.kind) {
      case 'log': {
        if (this.unit === null) {
          this.pendingRaw.push(line);
          const u = detectTimeUnit(this.pendingRaw.map((r) => r.t));
          if (u === null && this.pendingRaw.length < 50) return res;
          this.unit = u ?? 'ms';
          for (const r of this.pendingRaw) this.addRow(r, res);
          this.pendingRaw = [];
        } else this.addRow(line, res);
        return res;
      }
      case 'io': {
        this.io = { ...this.io, ...line.io };
        this.ioAtT = this.lastRow?.t ?? null;
        if (line.io.Y3 !== undefined) {
          if (line.io.Y3 && this.lastY3 === false) {
            this.y3Pulses++;
            this.cycles.addY3Pulse();
          }
          if (this.lastY3 === null && line.io.Y3) {
            this.y3Pulses++;
            this.cycles.addY3Pulse();
          }
          this.lastY3 = line.io.Y3;
        }
        if (line.alarm !== null) {
          const list = line.alarm === 'NONE' || line.alarm === 'BRAK' ? [] : line.alarm.split(',').filter(Boolean);
          this.activeAlarms = list;
        }
        return res;
      }
      case 'alarm': {
        for (const code of line.codes) {
          const entry: StationAlarmEntry = { code, text: line.text, t: this.lastRow?.t ?? null, at: new Date().toISOString() };
          this.alarms.push(entry);
          this.alarmsSeen.add(code);
          this.cycles.addAlarm(entry);
          res.alarms.push(entry);
          if (this.activeAlarms !== null && !this.activeAlarms.includes(code)) this.activeAlarms = [...this.activeAlarms, code];
          else if (this.activeAlarms === null) this.activeAlarms = [code];
        }
        return res;
      }
      case 'alarmClear':
        this.activeAlarms = [];
        res.text = line.text;
        return res;
      case 'ack':
      case 'text':
        res.text = line.text;
        return res;
      case 'header':
        return res;
    }
  }

  private addRow(raw: { t: number; stage: number; x: number; F: number | null }, res: StationConsumeResult) {
    const row: StationRow = { t: this.toSeconds(raw.t), stage: raw.stage, x: raw.x, F: raw.F };
    const prev = this.lastRow;
    if (!prev || Math.abs(row.x - prev.x) > 0.005 || this.lastMoveT === null) this.lastMoveT = row.t;
    this.lastRow = row;
    res.rows.push(row);
    const closed = this.cycles.addRow(row);
    if (closed) res.closedCycles.push(closed);
  }

  /** Obserwacja do oceny scenariuszy; pola bez danych mają wartość null. */
  observation(): StationObservation {
    const r = this.lastRow;
    return {
      stage: r ? r.stage : null,
      alarmsSeen: [...this.alarmsSeen],
      y3Pulses: this.y3Pulses,
      atS1: this.io.S1 ?? null,
      motorOn: this.io.M1 ?? null,
      doorClosed: this.io.S6 ?? null,
      stillMs: r && this.lastMoveT !== null ? (r.t - this.lastMoveT) * 1000 : 0,
    };
  }

  /** Zerowanie liczników obserwacji (początek scenariusza). */
  resetCounters(): void {
    this.alarmsSeen.clear();
    this.y3Pulses = 0;
  }
}
