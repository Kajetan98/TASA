import { describe, expect, it } from 'vitest';
import { parseStationLine } from '../src/protocol/stationFrames';
import { StationModel } from '../src/domain/stationModel';
import type { StationCycle } from '../src/domain/stationAnalysis';
import { checkOutcome, isSettled, ScenarioDriver, STATION_SCENARIOS } from '../src/sim/stationScenarios';
import type { StationScenario } from '../src/sim/stationScenarios';

/** Przebieg scenariusza: wiersze symulatora → parser → model stacji; operator działa na obserwacji z wierszy. */
function run(s: StationScenario, maxMs = 600_000) {
  const drv = new ScenarioDriver(s);
  const model = new StationModel();
  const cycles: StationCycle[] = [];
  const feed = (lines: string[]) => {
    for (const l of lines) {
      const r = model.consume(parseStationLine(l));
      cycles.push(...r.closedCycles);
    }
  };
  feed(drv.sim.hello());
  feed(drv.advance(1000));
  model.resetCounters();
  let step = 0;
  const commandsAt: number[] = [];
  let settled = false;
  for (let t = 0; t < maxMs; t += 20) {
    feed(drv.advance(20));
    const o = model.observation();
    if (step < s.operator.length && s.operator[step].when(o)) {
      feed([]);
      drv.sim.command(s.operator[step].command);
      commandsAt.push(drv.sim.elapsedMs);
      step++;
      continue;
    }
    if (isSettled(step === s.operator.length, o) && (o.stage === 0 || o.stage === 6 || o.alarmsSeen.length > 0)) {
      settled = true;
      feed(drv.advance(3000)); // czas na zamknięcie rekordu cyklu
      break;
    }
  }
  return { drv, model, cycles, settled, commandsAt };
}

describe('scenariusze stacji T1–T7 (pełna ścieżka: symulator → parser → model)', () => {
  for (const s of STATION_SCENARIOS) {
    it(`${s.id} ${s.name}: oczekiwany stan końcowy i alarmy`, () => {
      const { drv, model, settled } = run(s);
      expect(settled, 'scenariusz nie osiągnął stanu ustalonego').toBe(true);
      const checks = checkOutcome(s.expected, model.observation());
      for (const c of checks) expect(c.ok, `${c.label}: oczekiwano ${c.expected}, jest ${c.observed}`).toBe(true);
      expect(drv.sim.latchedCount).toBe(s.expected.latched);
    });
  }

  it('T1: nachylenie ok. 25,6 N/mm, siła resztkowa < 20 N, cykl ok. 63 s', () => {
    const { cycles, commandsAt } = run(STATION_SCENARIOS.find((x) => x.id === 'T1')!);
    const c = cycles.find((x) => x.kind === 'uzbrojenie')!;
    expect(c.armed).toBe(true);
    expect(c.attempts).toHaveLength(1);
    const a = c.attempts[0];
    expect(a.fit!.slope).toBeGreaterThan(25.6 * 0.99);
    expect(a.fit!.slope).toBeLessThan(25.6 * 1.01);
    expect(a.peakF!).toBeGreaterThan(1386 * 0.98);
    expect(a.peakF!).toBeLessThan(1386 * 1.03);
    expect(Math.abs(a.residualF!)).toBeLessThan(20);
    const startT = commandsAt[0] / 1000;
    const cycleS = c.endT! - c.startT;
    expect(startT).toBeGreaterThan(0);
    // cykl od START do płyty w S1 (bez czasu ustalania rekordu)
    expect(cycleS - 2).toBeGreaterThan(60);
    expect(cycleS - 2).toBeLessThan(66);
  });

  it('T2: nachylenie ok. 21,3 N/mm wykryte w etapie 4', () => {
    const { cycles, model } = run(STATION_SCENARIOS.find((x) => x.id === 'T2')!);
    const c = cycles[0];
    expect(c.attempts[0].fit!.slope).toBeGreaterThan(21.3 * 0.98);
    expect(c.attempts[0].fit!.slope).toBeLessThan(21.3 * 1.02);
    expect(c.attempts[0].slopeOk).toBe(false);
    expect(model.alarms.map((a) => a.code)).toEqual(['SPRING_SLOPE']);
    const alarmT = model.alarms[0].t!;
    expect(alarmT - c.startT).toBeGreaterThan(24);
    expect(alarmT - c.startT).toBeLessThan(31);
  });

  it('T3: siła resztkowa ok. 210 N po 1. próbie, 2 próby, rozładowanie', () => {
    const { cycles } = run(STATION_SCENARIOS.find((x) => x.id === 'T3')!);
    const c = cycles[0];
    expect(c.attempts).toHaveLength(2);
    expect(c.attempts[0].residualF!).toBeGreaterThan(195);
    expect(c.attempts[0].residualF!).toBeLessThan(225);
    expect(c.attempts[1].expectedSource).toBe('szacunek z siły resztkowej');
    expect(c.attempts[1].slopeOk).toBe(true);
    expect(c.stagesVisited).toContain(7);
    expect(c.stagesVisited).toContain(8);
    expect(c.y3Pulses).toBe(1);
  });

  it('T7: rekord rozładowania z jednym impulsem Y3', () => {
    const { cycles } = run(STATION_SCENARIOS.find((x) => x.id === 'T7')!);
    const d = cycles.find((x) => x.kind === 'rozładowanie')!;
    expect(d).toBeTruthy();
    expect(d.y3Pulses).toBe(1);
    expect(d.alarms).toHaveLength(0);
    expect(d.finalStage).toBe(0);
  });

  it('bez rozszerzeń firmware (tylko LOG i alarm w tekście) parser przyjmuje wiersze, a lampki nie mają danych', () => {
    const drv = new ScenarioDriver(STATION_SCENARIOS[1], { extensions: false });
    const model = new StationModel();
    const feed = (ls: string[]) => ls.forEach((l) => model.consume(parseStationLine(l)));
    feed(drv.sim.hello());
    feed(drv.advance(500));
    drv.sim.command('START');
    for (let i = 0; i < 2000; i++) feed(drv.advance(20));
    expect(model.lastRow).not.toBeNull();
    expect(model.io.S1).toBeUndefined();
    expect(model.alarms.map((a) => a.code)).toContain('SPRING_SLOPE');
  });
});
