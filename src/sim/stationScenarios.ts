import type { StationSimConfig } from './stationSim';
import { StationSim } from './stationSim';

/**
 * Scenariusze testowe stacji uzbrajania (praca, Tab. 33). Zdarzenia środowiska (otwarcie osłony,
 * usterka czujnika) wykonuje symulator; kroki operatora wykonuje użytkownik w panelu stacji
 * (albo automat w testach jednostkowych).
 */

export type StationScenarioId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

/** Obserwacja stanu stacji wyłącznie z odebranych wierszy (lub z symulatora w testach). */
export interface StationObservation {
  stage: number | null;
  alarmsSeen: string[];
  y3Pulses: number;
  atS1: boolean | null;
  motorOn: boolean | null;
  doorClosed: boolean | null;
  /** Czas bez ruchu płyty [ms]. */
  stillMs: number;
}

interface EnvContext {
  fired: Record<string, number>;
}

export interface EnvEvent {
  id: string;
  description: string;
  when: (sim: StationSim, ctx: EnvContext) => boolean;
  apply: (sim: StationSim) => void;
}

export interface OperatorStep {
  command: 'START' | 'RESET' | 'DISCHARGE';
  hint: string;
  when: (o: StationObservation) => boolean;
}

export interface ExpectedOutcome {
  summary: string;
  finalStage: number;
  alarms: string[];
  y3Pulses: number;
  plateAtS1: boolean;
  motorStopped: boolean;
  /** Oczekiwana liczba zatrzaśniętych zaczepów (sprawdzana tylko w testach symulatora). */
  latched: number;
}

export interface StationScenario {
  id: StationScenarioId;
  name: string;
  description: string;
  config: Partial<StationSimConfig>;
  env: EnvEvent[];
  operator: OperatorStep[];
  expected: ExpectedOutcome;
}

const idle = (o: StationObservation) => o.stage === 0 && o.motorOn === false && o.atS1 === true && o.stillMs > 300;

const START: OperatorStep = { command: 'START', hint: 'Wyślij START (okno potwierdzenia).', when: idle };


export const STATION_SCENARIOS: StationScenario[] = [
  {
    id: 'T1',
    name: 'Uzbrajanie bez usterek',
    description: 'Sześć sprężyn, wszystkie zaczepy sprawne.',
    config: {},
    env: [],
    operator: [START],
    expected: {
      summary: 'etap 6, brak alarmu, nachylenie ok. 25,6 N/mm, siła resztkowa < 20 N, płyta w S1',
      finalStage: 6, alarms: [], y3Pulses: 0, plateAtS1: true, motorStopped: true, latched: 6,
    },
  },
  {
    id: 'T2',
    name: 'Brak jednej sprężyny',
    description: 'Sprężyna P3 usunięta; nachylenie ok. 21,3 N/mm.',
    config: { springsPresent: [true, true, false, true, true, true] },
    env: [],
    operator: [START],
    expected: {
      summary: 'alarm SPRING_SLOPE w etapie 4, płyta wraca do S1, żaden zaczep nie zatrzaśnięty',
      finalStage: 0, alarms: ['SPRING_SLOPE'], y3Pulses: 0, plateAtS1: true, motorStopped: true, latched: 0,
    },
  },
  {
    id: 'T3',
    name: 'Trwale niezatrzaśnięty zaczep',
    description: 'Zaczep P5 nie zatrzaskuje się; siła resztkowa ok. 210 N.',
    config: { latchFaults: ['ok', 'ok', 'ok', 'ok', 'permanent', 'ok'] },
    env: [],
    operator: [START],
    expected: {
      summary: '2 próby naciągu, alarm ARM_FAILED, rozładowanie jednym impulsem Y3, płyta w S1',
      finalStage: 0, alarms: ['ARM_FAILED'], y3Pulses: 1, plateAtS1: true, motorStopped: true, latched: 0,
    },
  },
  {
    id: 'T4',
    name: 'Przejściowa usterka zaczepu',
    description: 'Zaczep P2 nie zatrzaskuje się w 1. próbie, w 2. próbie działa.',
    config: { latchFaults: ['ok', 'transient', 'ok', 'ok', 'ok', 'ok'] },
    env: [],
    operator: [START],
    expected: {
      summary: 'uzbrojona w 2. próbie, brak alarmu',
      finalStage: 6, alarms: [], y3Pulses: 0, plateAtS1: true, motorStopped: true, latched: 6,
    },
  },
  {
    id: 'T5',
    name: 'Otwarcie osłony w trakcie naciągu',
    description: 'Osłona S6 otwiera się po 20 mm naciągu i zamyka po 3 s.',
    config: {},
    env: [
      {
        id: 'door-open',
        description: 'otwarcie osłony po 20 mm naciągu',
        when: (s) => s.stage === 4 && s.strokeFromContact >= 20,
        apply: (s) => { s.doorClosed = false; },
      },
      {
        id: 'door-close',
        description: 'zamknięcie osłony 3 s po otwarciu',
        when: (s, c) => c.fired['door-open'] !== undefined && s.elapsedMs - c.fired['door-open'] >= 3000,
        apply: (s) => { s.doorClosed = true; },
      },
    ],
    operator: [
      START,
      {
        command: 'RESET',
        hint: 'Po alarmie DOOR i zamknięciu osłony wyślij RESET.',
        when: (o) => o.alarmsSeen.includes('DOOR') && o.doorClosed === true && o.stillMs > 300,
      },
    ],
    expected: {
      summary: 'alarm DOOR, napęd zatrzymany; po RESET bazowanie do S1',
      finalStage: 0, alarms: ['DOOR'], y3Pulses: 0, plateAtS1: true, motorStopped: true, latched: 0,
    },
  },
  {
    id: 'T6',
    name: 'Utrata czujnika siły i przeciążenie',
    description: 'Po 25 mm naciągu czujnik przestaje odpowiadać, następnie zwraca wartość nasyconą.',
    config: {},
    env: [
      {
        id: 'sensor-dropout',
        description: 'zanik próbek czujnika siły',
        when: (s) => s.stage === 4 && s.strokeFromContact >= 25,
        apply: (s) => { s.sensorMode = 'dropout'; },
      },
      {
        id: 'sensor-saturated',
        description: 'czujnik wraca z wartością nasyconą 2047 N',
        when: (s, c) => c.fired['sensor-dropout'] !== undefined && s.alarms.has('SENSOR') && s.elapsedMs - c.fired['sensor-dropout'] >= 200,
        apply: (s) => { s.sensorMode = 'saturated'; },
      },
    ],
    operator: [START],
    expected: {
      summary: 'alarmy SENSOR i OVERLOAD, napęd zatrzymany w etapie 4',
      finalStage: 4, alarms: ['SENSOR', 'OVERLOAD'], y3Pulses: 0, plateAtS1: false, motorStopped: true, latched: 0,
    },
  },
  {
    id: 'T7',
    name: 'Rozładowanie na rozkaz',
    description: 'Uzbrojenie jak w T1, następnie polecenie DISCHARGE.',
    config: {},
    env: [],
    operator: [
      START,
      {
        command: 'DISCHARGE',
        hint: 'Po uzbrojeniu (etap 6, płyta w S1) wyślij DISCHARGE (okno potwierdzenia).',
        when: (o) => o.stage === 6 && o.atS1 === true && o.motorOn === false && o.stillMs > 500,
      },
    ],
    expected: {
      summary: 'jeden impuls Y3, brak wystrzału, zaczepy zwolnione, etap 0, płyta w S1, brak alarmu',
      finalStage: 0, alarms: [], y3Pulses: 1, plateAtS1: true, motorStopped: true, latched: 0,
    },
  },
];


export const scenarioById = (id: string) => STATION_SCENARIOS.find((s) => s.id === id);

/** Symulator stacji z dołączonym scenariuszem (zdarzenia środowiska wykonywane co krok). */
export class ScenarioDriver {
  readonly sim: StationSim;
  private ctx: EnvContext = { fired: {} };
  private pending: EnvEvent[];

  constructor(readonly scenario: StationScenario | null, extra: Partial<StationSimConfig> = {}) {
    this.sim = new StationSim({ ...(scenario?.config ?? {}), ...extra });
    this.pending = [...(scenario?.env ?? [])];
  }

  advance(ms: number): string[] {
    if (this.pending.length === 0) return this.sim.advance(ms);
    return this.sim.advance(ms, (s) => {
      for (let i = 0; i < this.pending.length; i++) {
        const e = this.pending[i];
        if (e.when(s, this.ctx)) {
          e.apply(s);
          this.ctx.fired[e.id] = s.elapsedMs;
          this.pending.splice(i, 1);
          i--;
        }
      }
    });
  }

  get firedEnv(): string[] {
    return Object.keys(this.ctx.fired);
  }
}

export interface OutcomeCheck {
  label: string;
  expected: string;
  observed: string;
  ok: boolean;
}

/** Porównuje obserwację z oczekiwanym wynikiem scenariusza. */
export function checkOutcome(exp: ExpectedOutcome, o: StationObservation): OutcomeCheck[] {
  const setEq = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const fmt = (a: string[]) => (a.length ? a.join(', ') : 'brak');
  return [
    { label: 'Etap końcowy', expected: String(exp.finalStage), observed: o.stage === null ? 'brak danych' : String(o.stage), ok: o.stage === exp.finalStage },
    { label: 'Alarmy', expected: fmt(exp.alarms), observed: fmt(o.alarmsSeen), ok: setEq(exp.alarms, o.alarmsSeen) },
    { label: 'Impulsy Y3', expected: String(exp.y3Pulses), observed: String(o.y3Pulses), ok: o.y3Pulses === exp.y3Pulses },
    { label: 'Płyta w S1', expected: exp.plateAtS1 ? 'tak' : 'nie', observed: o.atS1 === null ? 'brak danych' : o.atS1 ? 'tak' : 'nie', ok: o.atS1 === exp.plateAtS1 },
    { label: 'Napęd zatrzymany', expected: exp.motorStopped ? 'tak' : 'nie', observed: o.motorOn === null ? 'brak danych' : o.motorOn ? 'nie' : 'tak', ok: o.motorOn === !exp.motorStopped },
  ];
}

/** Stan ustalony: wszystkie kroki operatora wykonane, płyta stoi od 1,5 s. */
export function isSettled(stepsDone: boolean, o: StationObservation): boolean {
  return stepsDone && o.motorOn === false && o.stillMs >= 1500;
}

/** Automat do testów: obserwacja bezpośrednio z symulatora. */
export function observeSim(sim: StationSim, stillMs: number, alarmsSeen: Set<string>, y3: number): StationObservation {
  const io = sim.ioState();
  return {
    stage: sim.stage,
    alarmsSeen: [...alarmsSeen],
    y3Pulses: y3,
    atS1: io.S1,
    motorOn: io.M1,
    doorClosed: io.S6,
    stillMs,
  };
}
