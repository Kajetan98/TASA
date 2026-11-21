import { useState } from 'react';
import { PUSHER_COUNT } from '../../config/tasa';
import { defaultDropParams } from '../../sim/anchorSim';
import type { DropParams } from '../../sim/anchorSim';
import { anchor, anchorSim, isSimulated, useApp } from '../../store/app';

/** Sterowanie symulatorem modułu kotwicy (widoczne tylko, gdy źródłem jest symulator). */
export function AnchorSimControls({ compact = false }: { compact?: boolean }) {
  useApp((s) => s.tick);
  const setLast = useApp((s) => s.setLastDropParams);
  const [p, setP] = useState<DropParams>(defaultDropParams());
  if (!isSimulated('anchor')) return null;
  const sim = anchorSim.sim;
  const busy = anchor.capturing || (sim.phase !== 'hanging');
  const num = (k: keyof DropParams, v: string) => setP({ ...p, [k]: v === '' ? 0 : Number(v.replace(',', '.')) });

  const drop = () => {
    setLast(p);
    anchorSim.drop(p);
  };

  return (
    <section className="scenario" aria-label="Symulator modułu kotwicy">
      <h3>Symulator modułu kotwicy</h3>
      {!compact && (
        <div className="form-grid">
          <label className="field">
            <span>Wysokość zrzutu [m]</span>
            <input type="number" step="0.01" min="0.02" max="2" value={p.heightM} onChange={(e) => num('heightM', e.target.value)} />
          </label>
          <label className="field">
            <span>Rozrzut zadany [ms]</span>
            <input type="number" step="0.1" min="0" max="20" value={p.spreadMs} onChange={(e) => num('spreadMs', e.target.value)} />
          </label>
          <label className="field">
            <span>Kontakt → tarcza [ms]</span>
            <input type="number" step="0.1" min="0" max="50" value={p.contactToDiskMs} onChange={(e) => num('contactToDiskMs', e.target.value)} />
          </label>
          <label className="field">
            <span>Czas skoku [ms]</span>
            <input type="number" step="0.1" min="1" max="30" value={p.strokeMs} onChange={(e) => num('strokeMs', e.target.value)} />
          </label>
          <label className="field">
            <span>Przechył po przyziemieniu [°]</span>
            <input type="number" step="0.5" min="0" max="90" value={p.tiltAfterDeg} onChange={(e) => num('tiltAfterDeg', e.target.value)} />
          </label>
          <label className="field">
            <span>Zablokowany popychacz</span>
            <select value={p.blockedPusher ?? ''} onChange={(e) => setP({ ...p, blockedPusher: e.target.value ? Number(e.target.value) : null })}>
              <option value="">brak</option>
              {Array.from({ length: PUSHER_COUNT }, (_, i) => (
                <option key={i} value={i + 1}>P{i + 1}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={drop} disabled={busy}>
          Zrzut ({p.heightM.toLocaleString('pl-PL')} m, rozrzut {p.spreadMs.toLocaleString('pl-PL')} ms{p.blockedPusher ? `, P${p.blockedPusher} zablokowany` : ''})
        </button>
        <button type="button" className="btn" onClick={() => anchorSim.sim.removePin()} disabled={sim.pin === 0 || sim.phase !== 'hanging'}>
          Usuń zawleczkę
        </button>
        <button type="button" className="btn" onClick={() => anchorSim.sim.rearmMechanism()} disabled={anchor.capturing}>
          Uzbrój kotwicę ponownie
        </button>
      </div>
      {sim.phase !== 'hanging' && (
        <p style={{ fontSize: 'var(--t-s)', margin: '8px 0 0' }}>Kotwica po zrzucie. Kolejny zrzut wymaga ponownego uzbrojenia.</p>
      )}
      <p className="muted" style={{ fontSize: 'var(--t-xs)', margin: '8px 0 0' }}>
        Czasy domyślne z symulacji w pracy (8.1): wyzwolenie 7,2 ms po kontakcie, koniec skoku po 12,6 ms. Szczyt przyspieszenia 40 g i impuls 3 ms są założeniem symulatora.
      </p>
    </section>
  );
}
