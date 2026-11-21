import type { StationAlarmEntry, StationCycle } from '../domain/stationAnalysis';
import { StationModel } from '../domain/stationModel';
import { parseStationLine } from '../protocol/stationFrames';
import { SourceEngine } from './sourceEngine';

export type StationCommand = 'START' | 'DISCHARGE' | 'RESET' | 'STATUS' | 'ZERO' | 'CAL';

/** Źródło B: sterownik stacji uzbrajania. */
export class StationEngine extends SourceEngine {
  model = new StationModel();
  /** Ostatni zamknięty cykl (wykres F(x) pozostaje widoczny po zakończeniu). */
  lastCycle: StationCycle | null = null;
  onCycle: ((c: StationCycle) => void) | null = null;
  onAlarm: ((a: StationAlarmEntry) => void) | null = null;
  ioAt: number | null = null; // performance.now() ostatniego wiersza IO/STATUS
  rowVersion = 0;
  /** Polecenia wysłane w bieżącym scenariuszu symulacji. */
  sentCommands: string[] = [];

  protected onReset(): void {
    this.model = new StationModel();
    this.lastCycle = null;
    this.ioAt = null;
  }

  protected handleLine(line: string): boolean {
    const parsed = parseStationLine(line);
    const r = this.model.consume(parsed);
    if (parsed.kind === 'io') this.ioAt = performance.now();
    if (parsed.kind !== 'log') this.log('rx', line);
    if (r.rows.length) this.rowVersion++;
    for (const a of r.alarms) this.onAlarm?.(a);
    for (const c of r.closedCycles) {
      this.lastCycle = c;
      this.onCycle?.(c);
    }
    return true;
  }

  /** Rozłączenie zamyka otwarty rekord cyklu, aby dane nie zostały utracone. */
  async disconnect(): Promise<void> {
    const c = this.model.cycles.flush();
    if (c) {
      this.lastCycle = c;
      this.onCycle?.(c);
    }
    await super.disconnect();
  }

  /** Cykl do wyświetlenia na wykresie: bieżący albo ostatni zamknięty. */
  get displayCycle(): StationCycle | null {
    return this.model.cycles.active ?? this.lastCycle;
  }

  async send(cmd: StationCommand, arg?: string): Promise<void> {
    const line = arg ? `${cmd} ${arg}` : cmd;
    this.sentCommands.push(cmd);
    await this.writeLine(line);
  }
}
