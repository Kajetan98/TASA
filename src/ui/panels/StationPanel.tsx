import { useState } from 'react';
import { LINK_TIMEOUT_MS, OVERLOAD_FORCE_N, RESIDUAL_FORCE_LIMIT_N, formatCalCommand, stageInfo } from '../../config/tasa';
import { alarmInfo } from '../../domain/alarms';
import { checkOutcome, isSettled, scenarioById, STATION_SCENARIOS } from '../../sim/stationScenarios';
import type { StationScenarioId } from '../../sim/stationScenarios';
import { connectSource, isSimulated, noteCommandSent, station, useApp } from '../../store/app';
import type { StationCommand } from '../../store/stationEngine';
import { isWebSerialSupported } from '../../transport/Transport';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon, Status } from '../components/Icon';
import { IO_META, Lamp } from '../components/Lamp';
import { Readout } from '../components/Readout';
import { fmt, fmtAge, fmtClock, fmtSigned } from '../format';
import { useNow } from '../hooks';
import { ForceChart } from './ForceChart';
import { Grafcet } from './Grafcet';

function lockReason(now: number): string | null {
  if (station.status !== 'connected') return 'Polecenia zablokowane: brak połączenia ze sterownikiem stacji.';
  const age = station.age(now);
  if (age === null) return 'Polecenia zablokowane: nie odebrano jeszcze żadnego wiersza ze sterownika.';
  if (age > LINK_TIMEOUT_MS) return `Polecenia zablokowane: brak wiersza ze sterownika od ${fmtAge(age)} (limit ${LINK_TIMEOUT_MS} ms).`;
  return null;
}

const ioVal = (v: boolean | undefined) => (v === undefined ? 'brak danych' : v ? '1' : '0');

function ConfirmBody({ cmd, now }: { cmd: 'START' | 'DISCHARGE'; now: number }) {
  const io = station.model.io;
  const ioAge = station.ioAt === null ? null : now - station.ioAt;
  const rows: [string, string, boolean | undefined][] = [
    ['S3', 'kotwica w gnieździe', io.S3],
    ['S4', 'szczęki zaciśnięte', io.S4],
    ['S5', 'zawleczka wsunięta', io.S5],
    ['S6', 'osłona zamknięta', io.S6],
  ];
  return (
    <>
      <p>
        {cmd === 'START'
          ? 'Sterownik rozpocznie cykl uzbrajania: zacisk szczęk, zawleczka, dojazd płyty i naciąg sprężyn do ok. 1386 N.'
          : 'Sterownik wykona kontrolowane rozładowanie: dojazd płyty do S2, wysunięcie zawleczki i jeden impuls Y3 przy podpartych popychaczach.'}
      </p>
      <table className="confirm-io">
        <tbody>
          {rows.map(([k, d, v]) => (
            <tr key={k}>
              <td><strong>{k}</strong> {d}</td>
              <td>{ioVal(v)}</td>
            </tr>
          ))}
          <tr>
            <td>Etap sterownika</td>
            <td>{station.model.lastRow ? `${station.model.lastRow.stage} (${stageInfo(station.model.lastRow.stage).short})` : 'brak danych'}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 'var(--t-s)' }}>
        Stan wejść z ostatniego wiersza IO/STATUS {ioAge === null ? '(sterownik nie wysłał wiersza IO)' : `sprzed ${fmtAge(ioAge)}`}. Aplikacja tylko wysyła polecenie; blokady osłony S6, STOP, przekaźnika K1 i warunki Y3 sprawdza sterownik.
      </p>
      <button type="button" className="btn small" onClick={() => void station.send('STATUS').catch(() => undefined)}>
        Odśwież stan (STATUS)
      </button>
    </>
  );
}

function Commands({ now }: { now: number }) {
  const [confirm, setConfirm] = useState<'START' | 'DISCHARGE' | null>(null);
  const [cal, setCal] = useState('100');
  const toast = useApp((s) => s.toast);
  const lock = lockReason(now);
  const calN = Number(cal.replace(',', '.'));

  const send = async (cmd: StationCommand, arg?: string) => {
    const l = lockReason(performance.now());
    if (l) {
      toast(l, 'crit');
      return;
    }
    try {
      await station.send(cmd, arg);
      noteCommandSent(cmd);
    } catch (e) {
      toast(`Nie wysłano polecenia ${cmd}: ${e instanceof Error ? e.message : String(e)}`, 'crit');
    }
  };

  const openConfirm = (cmd: 'START' | 'DISCHARGE') => {
    setConfirm(cmd);
    if (!lock) void station.send('STATUS').catch(() => undefined);
  };

  return (
    <section className="sheet" aria-label="Polecenia">
      <h2>Polecenia</h2>
      {lock && (
        <div className="lock-note" role="alert">
          <Icon name="lock" /> {lock}
        </div>
      )}
      <div className="cmd-grid">
        <button type="button" className="btn primary" disabled={!!lock} onClick={() => openConfirm('START')}>START</button>
        <button type="button" className="btn" disabled={!!lock} onClick={() => send('RESET')}>RESET</button>
        <button type="button" className="btn" disabled={!!lock} onClick={() => send('STATUS')}>STATUS</button>
        <button type="button" className="btn" disabled={!!lock} onClick={() => send('ZERO')} title="Tarowanie czujnika siły">ZERO</button>
        <div className="cal-row">
          <label className="field">
            <span>Znana siła do kalibracji [N]</span>
            <input type="number" min="1" step="0.1" value={cal} onChange={(e) => setCal(e.target.value)} />
          </label>
          <button type="button" className="btn" disabled={!!lock || !(calN > 0)} onClick={() => send('CAL', formatCalCommand(calN).replace(/^CAL\s*/, ''))}>
            CAL
          </button>
        </div>
        <button type="button" className="btn danger wide" disabled={!!lock} onClick={() => openConfirm('DISCHARGE')}>DISCHARGE (rozładowanie)</button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'DISCHARGE' ? 'Potwierdź rozładowanie' : 'Potwierdź start uzbrajania'}
        tone={confirm === 'DISCHARGE' ? 'danger' : undefined}
        confirmLabel={confirm === 'DISCHARGE' ? 'Wyślij DISCHARGE' : 'Wyślij START'}
        confirmDisabled={!!lock}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) void send(c);
        }}
      >
        {confirm && <ConfirmBody cmd={confirm} now={now} />}
        {lock && confirm && (
          <div className="lock-note" style={{ marginTop: 10 }}>
            <Icon name="lock" /> {lock}
          </div>
        )}
      </ConfirmDialog>
    </section>
  );
}

function ScenarioBox() {
  const run = useApp((s) => s.scenarioRun);
  const load = useApp((s) => s.loadScenario);
  if (!isSimulated('station')) return null;
  const sc = run ? scenarioById(run.id) : null;
  const obs = station.model.observation();
  const stepsDone = !!sc && run!.step >= sc.operator.length;
  // Płyta musiała się poruszyć po ostatnim poleceniu operatora; inaczej oceniany byłby stan sprzed reakcji sterownika.
  const m = station.model;
  const movedAfter = run?.stepT !== null && run?.stepT !== undefined && m.lastMoveT !== null && m.lastMoveT > run.stepT;
  const settled = !!sc && movedAfter && isSettled(stepsDone, obs) && (obs.stage === 0 || obs.stage === 6 || obs.alarmsSeen.length > 0);
  const checks = sc && settled ? checkOutcome(sc.expected, obs) : null;
  const allOk = checks?.every((c) => c.ok);
  return (
    <section className="scenario" aria-label="Scenariusz symulacji">
      <div className="sheet-head" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Scenariusz symulacji</h3>
        <div className="btn-row">
          <select aria-label="Scenariusz" value={run?.id ?? ''} onChange={(e) => load((e.target.value || null) as StationScenarioId | null)}>
            <option value="">tryb swobodny</option>
            {STATION_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>{s.id} {s.name}</option>
            ))}
          </select>
          <button type="button" className="btn small" onClick={() => load(run?.id ?? null)}>Załaduj od nowa</button>
        </div>
      </div>
      {sc ? (
        <>
          <p style={{ fontSize: 'var(--t-s)' }}>{sc.description}</p>
          <ol className="steps">
            {sc.operator.map((op, i) => (
              <li key={i}>
                {i < run!.step ? <Status tone="good">{op.command}</Status> : i === run!.step ? <Status tone="info">{op.command}</Status> : <Status tone="muted">{op.command}</Status>}
                <span className={i < run!.step ? 'muted' : undefined}>{op.hint}</span>
              </li>
            ))}
            {sc.env.map((e) => (
              <li key={e.id}>
                <Status tone="muted">sym.</Status>
                <span className="muted">{e.description} (wykonuje symulator)</span>
              </li>
            ))}
          </ol>
          <p style={{ fontSize: 'var(--t-s)' }}><strong>Oczekiwany wynik:</strong> {sc.expected.summary}.</p>
          {checks ? (
            <>
              <p>{allOk ? <Status tone="good">Wynik zgodny z oczekiwanym</Status> : <Status tone="crit">Wynik niezgodny z oczekiwanym</Status>}</p>
              <table className="checks">
                <thead><tr><th>Sprawdzenie</th><th>Oczekiwane</th><th>Z odebranych ramek</th><th /></tr></thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td>{c.expected}</td>
                      <td>{c.observed}</td>
                      <td>{c.ok ? <Icon name="ok" label="zgodne" /> : <Icon name="crit" label="niezgodne" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 'var(--t-s)' }}>Ocena pojawi się po wykonaniu kroków i zatrzymaniu płyty.</p>
          )}
        </>
      ) : (
        <p className="muted" style={{ fontSize: 'var(--t-s)' }}>Tryb swobodny: symulator stacji bez usterek, bez oceny wyniku.</p>
      )}
    </section>
  );
}

function NotConnected() {
  return (
    <div className="empty">
      <strong>Brak połączenia ze sterownikiem stacji</strong>
      <span>Nucleo-F446RE łączy się przez USB (ST-LINK VCP). Bez sprzętu użyj symulatora scenariuszy T1–T7.</span>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={() => connectSource('station', 'simulator')}>Połącz z symulatorem</button>
        <button type="button" className="btn" disabled={!isWebSerialSupported()} onClick={() => connectSource('station', 'serial')}>Połącz przez USB</button>
        <button type="button" className="btn ghost" onClick={() => useApp.getState().setTab('connections')}>Inne połączenia</button>
      </div>
    </div>
  );
}

export function StationPanel() {
  const now = useNow();
  const m = station.model;
  const row = m.lastRow;
  const age = station.age(now);
  const stale = age === null || age > LINK_TIMEOUT_MS;
  const cyc = station.displayCycle;
  const attempt = cyc?.attempts[cyc.attempts.length - 1] ?? null;
  const connected = station.status === 'connected' || station.status === 'connecting';
  const alarmNow = (m.activeAlarms ?? []).length > 0;
  const ioAge = station.ioAt === null ? null : now - station.ioAt;
  const alarms = [...m.alarms].reverse();

  return (
    <div className="grid station-layout">
      <div className="grid" style={{ minWidth: 0 }}>
        <section className="sheet" aria-label="Sekwencja uzbrajania">
          <div className="sheet-head">
            <h2>Sekwencja uzbrajania</h2>
            <span className="provenance">
              {row ? `etap ${row.stage}: ${stageInfo(row.stage).description}` : 'brak wiersza LOG'}
              {row && stale ? ' (nieaktualne)' : ''}
            </span>
          </div>
          {!connected && !row ? <NotConnected /> : <Grafcet active={row && !stale ? row.stage : null} visited={cyc?.stagesVisited ?? []} alarm={alarmNow} />}
        </section>

        <section className="sheet" aria-label="Siła na płycie w funkcji położenia">
          <div className="sheet-head">
            <h2>Siła na płycie F(x)</h2>
            <span className="provenance">
              {cyc ? `${cyc.kind === 'rozładowanie' ? 'rozładowanie' : 'cykl uzbrajania'} ${m.cycles.active ? 'w toku' : 'zakończony'}, ${cyc.rows.length} wierszy` : 'wykres pojawi się po rozpoczęciu cyklu'}
            </span>
          </div>
          <ForceChart />
          <p className="chart-caption">
            Charakterystyka oczekiwana poprowadzona od pierwszego punktu dopasowania z nachyleniem {attempt ? fmt(attempt.expectedSlope, 2) : '25,60'} N/mm ({attempt?.expectedSource ?? 'nominalna'}); pas ±10%. Zaznacz zakres myszą, aby powiększyć; dwuklik przywraca widok.
          </p>
          <div className="readouts" style={{ marginTop: 10 }}>
            <Readout label="Etap" value={row ? row.stage : '—'} sub={row ? stageInfo(row.stage).short : undefined} stale={stale && !!row} />
            <Readout label="t sterownika" value={row ? fmt(row.t, 2) : '—'} unit="s" stale={stale && !!row} sub={m.unit ? `jednostka w LOG: ${m.unit}` : 'wykrywanie jednostki'} />
            <Readout label="Położenie x" value={row ? fmt(row.x, 2) : '—'} unit="mm" stale={stale && !!row} />
            <Readout
              label="Siła F"
              value={row ? (row.F === null ? 'brak próbki' : fmt(row.F, 1)) : '—'}
              unit={row?.F !== null && row ? 'N' : undefined}
              tone={row?.F !== null && row && row.F! > OVERLOAD_FORCE_N ? 'crit' : row && row.F === null ? 'warn' : undefined}
              stale={stale && !!row}
            />
            <Readout
              label={`Nachylenie${attempt ? `, próba ${attempt.index}` : ''}`}
              value={attempt?.fit ? fmt(attempt.fit.slope, 2) : '—'}
              unit="N/mm"
              tone={attempt?.slopeOk === false ? 'crit' : attempt?.slopeOk ? 'good' : undefined}
              sub={attempt ? `oczek. ${fmt(attempt.expectedSlope, 2)}, odchyłka ${fmtSigned(attempt.slopeDevPct, 1)}%` : 'MNK z etapu 4'}
            />
            <Readout label="Siła szczytowa" value={fmt(attempt?.peakF ?? null, 0)} unit="N" sub="nominalnie 1386 N" />
            <Readout
              label="Siła resztkowa"
              value={fmt(attempt?.residualF ?? null, 1)}
              unit="N"
              tone={attempt?.residualOk === false ? 'crit' : attempt?.residualOk ? 'good' : undefined}
              sub={`próg ${RESIDUAL_FORCE_LIMIT_N} N`}
            />
            <Readout label="Skok naciągu" value={fmt(attempt?.stroke ?? null, 1)} unit="mm" sub="nominalnie 43,3 mm" />
          </div>
        </section>

        <ScenarioBox />
      </div>

      <div className="grid" style={{ minWidth: 0 }}>
        <Commands now={now} />

        <section className="sheet" aria-label="Wejścia i wyjścia sterownika">
          <div className="sheet-head">
            <h2>Wejścia i wyjścia</h2>
            <span className="provenance">{ioAge === null ? 'sterownik nie wysłał wiersza IO' : `wiersz IO sprzed ${fmtAge(ioAge)}`}</span>
          </div>
          <div className="io-grid">
            <div>
              <h3 className="io-head">Wejścia</h3>
              {IO_META.filter((x) => x.kind === 'in').map((x) => <Lamp key={x.key} meta={x} value={m.io[x.key]} />)}
            </div>
            <div>
              <h3 className="io-head">Wyjścia</h3>
              {IO_META.filter((x) => x.kind === 'out').map((x) => <Lamp key={x.key} meta={x} value={m.io[x.key]} />)}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 'var(--t-xs)', marginTop: 8 }}>Impulsy Y3 odebrane w tej sesji: {m.y3Pulses}.</p>
        </section>

        <section className="sheet" aria-label="Alarmy">
          <div className="sheet-head">
            <h2>Alarmy</h2>
            <span className="provenance">
              {m.activeAlarms === null ? 'aktywność nieznana' : m.activeAlarms.length ? `aktywne: ${m.activeAlarms.join(', ')}` : 'brak aktywnych według sterownika'}
            </span>
          </div>
          {alarms.length === 0 ? (
            <p className="muted">Sterownik nie zgłosił alarmu w tej sesji.</p>
          ) : (
            <ul className="alarm-list">
              {alarms.map((a, i) => {
                const info = alarmInfo(a.code);
                return (
                  <li key={i}>
                    <span style={{ color: 'var(--crit-text)' }}><Icon name="crit" /></span>
                    <div>
                      <span className="code">{a.code}</span> {info.title}
                      <div className="when">{a.t !== null ? `t = ${fmt(a.t, 2)} s, ` : ''}odebrano {fmtClock(Date.parse(a.at))}</div>
                    </div>
                    <span className="desc">{info.description}</span>
                    <span className="raw">wiersz: {a.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="sheet">
          <details>
            <summary>Konsola sterownika</summary>
            <div className="console" aria-live="off">
              {station.console.slice(-200).map((l, i) => (
                <div key={i} className={l.dir}>{fmtClock(l.at)} {l.dir === 'tx' ? '→' : l.dir === 'rx' ? '←' : '·'} {l.text}</div>
              ))}
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}

