import { useState } from 'react';
import { BLE_NAME_PREFIX, BLE_NUS_SERVICE, LINK_TIMEOUT_MS } from '../../config/tasa';
import { anchor, anchorSim, connectSource, simTransport, station, stationSim, useApp } from '../../store/app';
import type { TransportKind } from '../../transport/Transport';
import { isWebBluetoothSupported, isWebSerialSupported, transportKindLabel } from '../../transport/Transport';
import { Status } from '../components/Icon';
import { TasaMark } from '../components/TasaMark';
import { fmtAge } from '../format';
import { useNow } from '../hooks';

interface Opt {
  kind: TransportKind;
  hint: string;
  disabled?: boolean;
}

function SourceCard({ which }: { which: 'anchor' | 'station' }) {
  const now = useNow();
  const eng = which === 'anchor' ? anchor : station;
  const wsUrl = useApp((s) => (which === 'anchor' ? s.wsUrlAnchor : s.wsUrlStation));
  const setWs = useApp((s) => s.setWsUrl);
  const [kind, setKind] = useState<TransportKind>('simulator');
  const opts: Opt[] =
    which === 'anchor'
      ? [
          { kind: 'simulator', hint: 'Symulator modułu: zrzut, rozrzut zwolnienia, zablokowany popychacz.' },
          { kind: 'bluetooth', hint: `XIAO ESP32-S3, Nordic UART Service, nazwa z prefiksem "${BLE_NAME_PREFIX}".`, disabled: !isWebBluetoothSupported() },
          { kind: 'serial', hint: 'Moduł podłączony kablem USB (XIAO USB CDC lub konwerter UART).', disabled: !isWebSerialSupported() },
          { kind: 'websocket', hint: 'Mostek radiowy lub mostek Python wysyłający linie JSON.' },
        ]
      : [
          { kind: 'simulator', hint: 'Symulator sterownika ze scenariuszami T1–T7.' },
          { kind: 'serial', hint: 'Nucleo-F446RE przez USB (ST-LINK VCP), format t, stan, x, F.', disabled: !isWebSerialSupported() },
          { kind: 'websocket', hint: 'Mostek przekazujący wiersze sterownika.' },
        ];
  const age = eng.age(now);
  const connected = eng.status === 'connected';
  const stale = connected && (age === null || age > LINK_TIMEOUT_MS);
  return (
    <section className="sheet">
      <div className="sheet-head">
        <h2>{which === 'anchor' ? 'Moduł pomiarowy kotwicy' : 'Sterownik stacji uzbrajania'}</h2>
        {connected ? (
          stale ? <Status tone="crit">brak ramek {fmtAge(age)}</Status> : <Status tone="good">ramki co {age === null ? '—' : fmtAge(age)}</Status>
        ) : eng.status === 'error' ? (
          <Status tone="crit">błąd</Status>
        ) : (
          <Status tone="muted">{eng.status === 'connecting' ? 'łączenie' : 'rozłączony'}</Status>
        )}
      </div>
      {connected || eng.status === 'connecting' ? (
        <>
          <dl className="kv">
            <dt>Połączenie</dt>
            <dd>{eng.transport ? `${transportKindLabel[eng.transport.kind]}: ${eng.transport.label}` : '—'}</dd>
            <dt>Ramki / błędy</dt>
            <dd>{eng.frames} / {eng.parseErrors}</dd>
            {eng.statusDetail && (
              <>
                <dt>Szczegóły</dt>
                <dd>{eng.statusDetail}</dd>
              </>
            )}
          </dl>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => void eng.disconnect()}>Rozłącz</button>
          </div>
        </>
      ) : (
        <>
          {eng.status === 'error' && eng.statusDetail && <p><Status tone="crit">{eng.statusDetail}</Status></p>}
          <div className="kind-pick" role="radiogroup" aria-label="Rodzaj połączenia">
            {opts.map((o) => (
              <label key={o.kind} data-disabled={o.disabled ? 'true' : undefined}>
                <input type="radio" name={`kind-${which}`} value={o.kind} checked={kind === o.kind} disabled={o.disabled} onChange={() => setKind(o.kind)} />
                <span style={{ fontWeight: 600 }}>{transportKindLabel[o.kind]}{o.kind === 'bluetooth' ? ' (XIAO ESP32-S3)' : ''}</span>
                <span className="hint">{o.disabled ? 'Niedostępne w tej przeglądarce; użyj Chrome lub Edge.' : o.hint}</span>
              </label>
            ))}
          </div>
          {kind === 'websocket' && (
            <label className="field" style={{ marginBottom: 12 }}>
              <span>Adres WebSocket</span>
              <input type="url" value={wsUrl} onChange={(e) => setWs(which, e.target.value)} />
            </label>
          )}
          <button type="button" className="btn primary" onClick={() => void connectSource(which, kind)}>Połącz</button>
        </>
      )}
    </section>
  );
}

function SimSettings() {
  useApp((s) => s.tick);
  const speed = useApp((s) => s.simSpeed);
  const setSpeed = useApp((s) => s.setSimSpeed);
  const st = simTransport('station');
  const an = simTransport('anchor');
  const [, force] = useState(0);
  const sim = stationSim.driver.sim;
  return (
    <section className="sheet">
      <h2>Symulacja</h2>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 'var(--t-s)' }}>Tempo czasu symulacji</span>
        <div className="segmented" role="group" aria-label="Tempo symulacji">
          {[1, 5, 20, 50].map((v) => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => setSpeed(v)}>{v}×</button>
          ))}
        </div>
      </div>
      <h3>Stacja</h3>
      {st ? (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          <label className="check"><input type="checkbox" checked={st.linkPaused} onChange={(e) => { st.linkPaused = e.target.checked; force((n) => n + 1); }} /> Przerwij łącze (test blokady poleceń po {LINK_TIMEOUT_MS} ms)</label>
          <label className="check"><input type="checkbox" checked={sim.doorClosed} onChange={(e) => { sim.doorClosed = e.target.checked; force((n) => n + 1); }} /> Osłona S6 zamknięta</label>
          <label className="check"><input type="checkbox" checked={sim.anchorPresent} onChange={(e) => { sim.anchorPresent = e.target.checked; force((n) => n + 1); }} /> Kotwica w gnieździe (S3)</label>
          <label className="check"><input type="checkbox" checked={stationSim.extensions} onChange={(e) => { stationSim.setExtensions(e.target.checked); force((n) => n + 1); }} /> Firmware wysyła wiersze IO/STATUS/ALARM (wyłączone: tylko LOG i alarm w tekście)</label>
        </div>
      ) : (
        <p className="muted">Stacja nie jest połączona z symulatorem.</p>
      )}
      <h3>Moduł kotwicy</h3>
      {an ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <label className="check"><input type="checkbox" checked={an.linkPaused} onChange={(e) => { an.linkPaused = e.target.checked; force((n) => n + 1); }} /> Przerwij łącze Bluetooth</label>
          <label className="check"><input type="checkbox" checked={anchorSim.sim.cfg.pinSensor} onChange={(e) => { anchorSim.reconfigure({ pinSensor: e.target.checked }); force((n) => n + 1); }} /> Moduł ma czujnik zawleczki (pole pin)</label>
          <label className="check"><input type="checkbox" checked={anchorSim.sim.cfg.tiltInFirmware} onChange={(e) => { anchorSim.reconfigure({ tiltInFirmware: e.target.checked }); force((n) => n + 1); }} /> Firmware liczy przechył (pole tilt)</label>
        </div>
      ) : (
        <p className="muted">Moduł nie jest połączony z symulatorem.</p>
      )}
    </section>
  );
}

export function ConnectionsPanel() {
  return (
    <div className="grid conn-layout">
      <SourceCard which="anchor" />
      <SourceCard which="station" />
      <SimSettings />
      <section className="sheet">
        <h2>Uwagi o sprzęcie</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <TasaMark size={72} />
          <div style={{ fontSize: 'var(--t-s)' }}>
            <p>Web Serial i Web Bluetooth działają w Chrome i Edge na stronie z https lub localhost. Na Linuksie Web Bluetooth wymaga włączenia flagi w przeglądarce.</p>
            <p>Moduł kotwicy: usługa BLE <code>{BLE_NUS_SERVICE}</code>. Aluminiowa obudowa modułu ekranuje radio; praca przewiduje antenę zewnętrzną lub okno z tworzywa.</p>
            <p>Format ramek i polecenia: <code>docs/protokol.md</code>. Parametry niepotwierdzone: <code>src/config/tasa.ts</code>.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
