import { useEffect } from 'react';
import wordmarkUrl from '../assets/tasa-wordmark.svg';
import { LINK_TIMEOUT_MS } from '../config/tasa';
import { anchor, isSimulated, station, useApp } from '../store/app';
import type { TabId, ThemeChoice } from '../store/app';
import type { SourceEngine } from '../store/sourceEngine';
import { transportKindLabel } from '../transport/Transport';
import { Icon } from './components/Icon';
import { TasaMark } from './components/TasaMark';
import { fmtAge } from './format';
import { useNow } from './hooks';
import { ActivationPanel } from './panels/ActivationPanel';
import { AnchorPanel } from './panels/AnchorPanel';
import { ConnectionsPanel } from './panels/ConnectionsPanel';
import { StationPanel } from './panels/StationPanel';
import { TrialsPanel } from './panels/TrialsPanel';

const TABS: { id: TabId; label: string }[] = [
  { id: 'anchor', label: 'Stan kotwicy' },
  { id: 'activation', label: 'Aktywacja' },
  { id: 'station', label: 'Stacja uzbrajania' },
  { id: 'trials', label: 'Rejestr prób' },
  { id: 'connections', label: 'Połączenia' },
];

function linkState(e: SourceEngine, now: number): 'off' | 'ok' | 'stale' | 'error' | 'connecting' {
  if (e.status === 'error') return 'error';
  if (e.status === 'connecting') return 'connecting';
  if (e.status !== 'connected') return 'off';
  const a = e.age(now);
  return a !== null && a <= LINK_TIMEOUT_MS ? 'ok' : 'stale';
}

function LinkChip({ who, e, now }: { who: string; e: SourceEngine; now: number }) {
  const s = linkState(e, now);
  const setTab = useApp((st) => st.setTab);
  const icon = s === 'ok' ? 'link' : s === 'off' ? 'unlink' : s === 'connecting' ? 'dot' : 'crit';
  const how =
    s === 'off' ? 'rozłączony' : s === 'connecting' ? 'łączenie' : s === 'error' ? 'błąd połączenia' : s === 'stale' ? `brak ramek ${fmtAge(e.age(now))}` : `${transportKindLabel[e.transport!.kind]}, ${fmtAge(e.age(now))}`;
  return (
    <button type="button" className="linkchip" data-state={s} onClick={() => setTab('connections')} aria-label={`${who}: ${how}`}>
      <span style={{ gridRow: 'span 2', color: s === 'stale' || s === 'error' ? 'var(--crit-text)' : 'var(--ink-2)' }}>
        <Icon name={icon} />
      </span>
      <span className="who">{who}</span>
      <span className="how num">{how}</span>
    </button>
  );
}

const THEMES: { id: ThemeChoice; icon: 'auto' | 'sun' | 'moon'; label: string }[] = [
  { id: 'system', icon: 'auto', label: 'Motyw systemowy' },
  { id: 'light', icon: 'sun', label: 'Motyw jasny' },
  { id: 'dark', icon: 'moon', label: 'Motyw ciemny' },
];

function Banner({ now }: { now: number }) {
  const msgs: string[] = [];
  for (const [who, e] of [['Kotwica', anchor], ['Stacja', station]] as const) {
    const s = linkState(e, now);
    if (s === 'stale') msgs.push(`${who}: brak ramki od ${fmtAge(e.age(now))}${who === 'Stacja' ? ', polecenia zablokowane' : ', stan nieaktualny'}`);
    if (s === 'error') msgs.push(`${who}: ${e.statusDetail || 'błąd połączenia'}${who === 'Stacja' ? ', polecenia zablokowane' : ''}`);
  }
  if (!msgs.length) return null;
  return (
    <div className="banner" role="alert">
      <Icon name="crit" size={20} />
      <span>{msgs.join('. ')}.</span>
    </div>
  );
}

export function App() {
  const now = useNow();
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const trialsCount = useApp((s) => s.trials.length);
  const sim = isSimulated('anchor') || isSimulated('station');

  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <TasaMark onActivate={() => setTab('anchor')} />
            <span className="wordmark" role="img" aria-label="TASA" style={{ ['--wm' as string]: `url("${wordmarkUrl}")` }} />
            <span className="brand-sub">
              Monitor kotwicy i stacji uzbrajania
              <br />
              Tensinigryt, demonstrator
            </span>
          </div>
          {sim && <span className="simflag" title="Co najmniej jedno źródło danych to symulator">Symulacja</span>}
          <div className="links">
            <LinkChip who="Kotwica" e={anchor} now={now} />
            <LinkChip who="Stacja" e={station} now={now} />
          </div>
          <div className="theme-switch" role="group" aria-label="Motyw">
            {THEMES.map((t) => (
              <button key={t.id} type="button" aria-pressed={theme === t.id} aria-label={t.label} title={t.label} onClick={() => setTheme(t.id)}>
                <Icon name={t.icon} />
              </button>
            ))}
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Panele">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'trials' && trialsCount > 0 && <span className="count">{trialsCount}</span>}
            </button>
          ))}
        </nav>
      </header>
      <Banner now={now} />
      <main>
        {tab === 'anchor' && <AnchorPanel />}
        {tab === 'activation' && <ActivationPanel />}
        {tab === 'station' && <StationPanel />}
        {tab === 'trials' && <TrialsPanel />}
        {tab === 'connections' && <ConnectionsPanel />}
      </main>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            <Icon name={t.tone === 'good' ? 'ok' : t.tone === 'warn' ? 'warn' : t.tone === 'crit' ? 'crit' : 'info'} />
            <span>{t.text}</span>
            <button type="button" aria-label="Zamknij komunikat" onClick={() => dismiss(t.id)}>
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
