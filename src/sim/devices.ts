import type { SimDevice } from '../transport/simulator';
import { AnchorSim } from './anchorSim';
import type { AnchorSimConfig, DropParams, DropTruth } from './anchorSim';
import { ScenarioDriver, scenarioById } from './stationScenarios';
import type { StationScenarioId } from './stationScenarios';

/** Adapter symulatora stacji do transportu; pozwala zmienić scenariusz bez rozłączania. */
export class StationSimDevice implements SimDevice {
  readonly name = 'stacja uzbrajania';
  driver: ScenarioDriver = new ScenarioDriver(null);
  scenarioId: StationScenarioId | null = null;
  extensions = true;
  private queued: string[] = [];

  load(id: StationScenarioId | null) {
    const prevT = this.driver.sim.tMs;
    const sc = id ? scenarioById(id) ?? null : null;
    this.scenarioId = sc?.id ?? null;
    this.driver = new ScenarioDriver(sc, { extensions: this.extensions, bootOffsetMs: prevT + 500 });
    this.queued.push(...this.driver.sim.hello());
  }

  setExtensions(on: boolean) {
    this.extensions = on;
    this.load(this.scenarioId);
  }

  hello(): string[] {
    return this.driver.sim.hello();
  }

  advance(ms: number): string[] {
    const q = this.queued;
    this.queued = [];
    return [...q, ...this.driver.advance(ms)];
  }

  command(line: string): void {
    this.driver.sim.command(line);
  }
}

/** Adapter symulatora modułu kotwicy. */
export class AnchorSimDevice implements SimDevice {
  readonly name = 'moduł pomiarowy kotwicy';
  sim = new AnchorSim();
  private queued: string[] = [];

  reconfigure(cfg: Partial<AnchorSimConfig>) {
    const t = this.sim.nowUs;
    this.sim = new AnchorSim({ ...this.sim.cfg, ...cfg, bootOffsetUs: t + 1000 });
    this.queued.push(...this.sim.hello());
  }

  drop(p: Partial<DropParams>): DropTruth {
    return this.sim.startDrop(p);
  }

  hello(): string[] {
    return this.sim.hello();
  }

  advance(ms: number): string[] {
    const q = this.queued;
    this.queued = [];
    return [...q, ...this.sim.advance(ms), ...this.sim.drain()];
  }

  command(line: string): void {
    this.sim.command(line);
  }
}
