import { create } from 'zustand';
import { ANCHOR_SERIAL_BAUD, STATION_LINE_ENDING, STATION_SERIAL_BAUD } from '../config/tasa';
import type { CsvFormat } from '../export/csv';
import { AnchorSimDevice, StationSimDevice } from '../sim/devices';
import type { DropParams } from '../sim/anchorSim';
import type { StationScenarioId } from '../sim/stationScenarios';
import { scenarioById } from '../sim/stationScenarios';
import { SimulatorTransport } from '../transport/simulator';
import type { Transport, TransportKind } from '../transport/Transport';
import { WebBluetoothTransport } from '../transport/webBluetooth';
import { WebSerialTransport } from '../transport/webSerial';
import { WebSocketTransport } from '../transport/webSocket';
import { AnchorEngine } from './anchorEngine';
import { deleteTrial, listTrials, saveTrial, updateTrial } from './db';
import { StationEngine } from './stationEngine';
import type { TrialRecord } from './trials';
import { buildDropTrial, buildStationTrial } from './trials';

/** Silniki źródeł i urządzenia symulowane istnieją poza Reactem; store przechowuje stan interfejsu. */
export const anchor = new AnchorEngine();
export const station = new StationEngine();
export const stationSim = new StationSimDevice();
export const anchorSim = new AnchorSimDevice();

export type TabId = 'anchor' | 'activation' | 'station' | 'trials' | 'connections';
export type ThemeChoice = 'system' | 'light' | 'dark';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'crit';
}

interface ScenarioRun {
  id: StationScenarioId;
  /** Liczba wykonanych kroków operatora. */
  step: number;
  startedAt: number;
  /** Czas sterownika [s] w chwili ostatniego kroku operatora. */
  stepT: number | null;
}

interface AppState {
  tab: TabId;
  theme: ThemeChoice;
  now: number;
  tick: number;
  trials: TrialRecord[];
  selectedTrialId: string | null;
  selectedActivationId: string | null;
  csvFormat: CsvFormat;
  toasts: Toast[];
  simSpeed: number;
  scenarioRun: ScenarioRun | null;
  wsUrlAnchor: string;
  wsUrlStation: string;
  lastDropParams: DropParams | null;

  setTab: (t: TabId) => void;
  setTheme: (t: ThemeChoice) => void;
  setCsvFormat: (f: CsvFormat) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  refreshTrials: () => Promise<void>;
  selectTrial: (id: string | null) => void;
  selectActivation: (id: string | null) => void;
  patchTrial: (t: TrialRecord) => Promise<void>;
  removeTrial: (id: string) => Promise<void>;
  setSimSpeed: (s: number) => void;
  loadScenario: (id: StationScenarioId | null) => void;
  setWsUrl: (which: 'anchor' | 'station', url: string) => void;
  setLastDropParams: (p: DropParams) => void;
}

const readTheme = (): ThemeChoice => {
  try {
    const v = localStorage.getItem('tasa-theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

const readLs = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
const writeLs = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* pamięć przeglądarki niedostępna */
  }
};

let toastId = 1;

export const useApp = create<AppState>((set, get) => ({
  tab: 'anchor',
  theme: readTheme(),
  now: performance.now(),
  tick: 0,
  trials: [],
  selectedTrialId: null,
  selectedActivationId: null,
  csvFormat: readLs('tasa-csv', 'pl') === 'intl' ? 'intl' : 'pl',
  toasts: [],
  simSpeed: 1,
  scenarioRun: null,
  wsUrlAnchor: readLs('tasa-ws-anchor', 'ws://localhost:8765/kotwica'),
  wsUrlStation: readLs('tasa-ws-station', 'ws://localhost:8765/stacja'),
  lastDropParams: null,

  setTab: (tab) => set({ tab }),
  setTheme: (theme) => {
    writeLs('tasa-theme', theme);
    set({ theme });
  },
  setCsvFormat: (csvFormat) => {
    writeLs('tasa-csv', csvFormat);
    set({ csvFormat });
  },
  toast: (text, tone = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) });
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  refreshTrials: async () => {
    try {
      set({ trials: await listTrials() });
    } catch (e) {
      get().toast(`Nie można odczytać rejestru prób z IndexedDB: ${e instanceof Error ? e.message : String(e)}`, 'crit');
    }
  },
  selectTrial: (selectedTrialId) => set({ selectedTrialId }),
  selectActivation: (selectedActivationId) => set({ selectedActivationId }),
  patchTrial: async (t) => {
    await updateTrial(t);
    await get().refreshTrials();
  },
  removeTrial: async (id) => {
    await deleteTrial(id);
    if (get().selectedTrialId === id) set({ selectedTrialId: null });
    await get().refreshTrials();
  },
  setSimSpeed: (simSpeed) => {
    set({ simSpeed });
    for (const e of [anchor, station]) if (e.transport instanceof SimulatorTransport) e.transport.speed = simSpeed;
  },
  loadScenario: (id) => {
    // Otwarty rekord cyklu należy do poprzedniego scenariusza: zamknięcie przed przełączeniem.
    const open = station.model.cycles.flush();
    if (open) station.onCycle?.(open);
    stationSim.load(id);
    station.model.resetCounters();
    station.sentCommands = [];
    set({ scenarioRun: id ? { id, step: 0, startedAt: Date.now(), stepT: null } : null });
  },
  setWsUrl: (which, url) => {
    writeLs(which === 'anchor' ? 'tasa-ws-anchor' : 'tasa-ws-station', url);
    set(which === 'anchor' ? { wsUrlAnchor: url } : { wsUrlStation: url });
  },
  setLastDropParams: (lastDropParams) => set({ lastDropParams }),
}));

/** Tworzy transport wybranego rodzaju dla źródła. */
export function makeTransport(which: 'anchor' | 'station', kind: TransportKind): Transport {
  const s = useApp.getState();
  switch (kind) {
    case 'simulator': {
      const t = new SimulatorTransport(which === 'anchor' ? anchorSim : stationSim);
      t.speed = s.simSpeed;
      return t;
    }
    case 'serial':
      return which === 'anchor' ? new WebSerialTransport(ANCHOR_SERIAL_BAUD) : new WebSerialTransport(STATION_SERIAL_BAUD, STATION_LINE_ENDING);
    case 'bluetooth':
      return new WebBluetoothTransport();
    case 'websocket':
      return new WebSocketTransport(which === 'anchor' ? s.wsUrlAnchor : s.wsUrlStation, which === 'station' ? STATION_LINE_ENDING : '\n');
  }
}

export async function connectSource(which: 'anchor' | 'station', kind: TransportKind): Promise<void> {
  const eng = which === 'anchor' ? anchor : station;
  const app = useApp.getState();
  try {
    await eng.connect(makeTransport(which, kind));
    if (which === 'station' && kind === 'simulator' && !app.scenarioRun) app.loadScenario('T1');
    if (which === 'anchor' && kind !== 'simulator') void anchor.send('hello').catch(() => undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cancel|No port selected|User cancelled|chosen/i.test(msg)) app.toast(`Nie można połączyć: ${msg}`, 'crit');
  }
}

export const isSimulated = (which: 'anchor' | 'station') =>
  (which === 'anchor' ? anchor : station).transport instanceof SimulatorTransport;

export function simTransport(which: 'anchor' | 'station'): SimulatorTransport | null {
  const t = (which === 'anchor' ? anchor : station).transport;
  return t instanceof SimulatorTransport ? t : null;
}

// ───────────── powiązanie zdarzeń silników z rejestrem prób ─────────────

anchor.onActivation = (c) => {
  const app = useApp.getState();
  const sim = isSimulated('anchor');
  const rec = buildDropTrial(c, sim ? 'symulacja' : 'sprzęt', sim ? app.lastDropParams : null);
  saveTrial(rec)
    .then(async (saved) => {
      await app.refreshTrials();
      useApp.setState({ selectedActivationId: saved.id });
      const r = saved.drop!.result;
      app.toast(
        `Zarejestrowano zdarzenie ${saved.id}: rozrzut ${r.releaseSpreadMs?.toFixed(3) ?? '—'} ms${r.notReachedEnd.length ? `, bez KONIEC: ${r.notReachedEnd.map((n) => 'P' + n).join(', ')}` : ''}.`,
        r.notReachedEnd.length ? 'warn' : 'good',
      );
    })
    .catch((e) => app.toast(`Nie zapisano rekordu zdarzenia: ${e instanceof Error ? e.message : String(e)}`, 'crit'));
};

station.onCycle = (c) => {
  const app = useApp.getState();
  const sim = isSimulated('station');
  const rec = buildStationTrial(c, sim ? 'symulacja' : 'sprzęt', sim ? app.scenarioRun?.id ?? null : null);
  saveTrial(rec)
    .then(() => app.refreshTrials())
    .catch((e) => app.toast(`Nie zapisano rekordu cyklu: ${e instanceof Error ? e.message : String(e)}`, 'crit'));
};

/** Postęp scenariusza: krok operatora uznany za wykonany po wysłaniu odpowiedniego polecenia. */
export function noteCommandSent(cmd: string) {
  const s = useApp.getState();
  const run = s.scenarioRun;
  if (!run || !isSimulated('station')) return;
  const sc = scenarioById(run.id);
  const next = sc?.operator[run.step];
  if (next && next.command === cmd) useApp.setState({ scenarioRun: { ...run, step: run.step + 1, stepT: station.model.lastRow?.t ?? null } });
}

// ───────────── pętla odświeżania interfejsu ─────────────

let started = false;
export function startUiLoop() {
  if (started) return;
  started = true;
  setInterval(() => {
    anchor.tick();
    useApp.setState({ now: performance.now(), tick: anchor.version + station.version });
  }, 100);
  void useApp.getState().refreshTrials();
}
