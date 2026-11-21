import type uPlot from 'uplot';
import { TIP_OVER_ANGLE_DEG } from '../../config/tasa';
import type { TrialRecord } from '../../store/trials';
import { trialCsv, trialJson, downloadText } from '../../export/csv';
import { anchor, isSimulated, useApp } from '../../store/app';
import { Icon, Status } from '../components/Icon';
import { Readout } from '../components/Readout';
import { axisStyle, cssVar, UPlotChart } from '../components/UPlotChart';
import { axisValues, fmt, fmtTime } from '../format';
import { useResolvedTheme } from '../hooks';
import { AnchorSimControls } from './AnchorSimControls';
import { Timeline } from './Timeline';

function WindowChart({ rec }: { rec: TrialRecord }) {
  const theme = useResolvedTheme();
  const d = rec.drop!;
  const w = d.windows.find((x) => x.ch === 'az') ?? d.windows[0];
  const r = d.result;
  const t0 = r.contact_us ?? r.disk_us;
  if (!w) {
    return <p className="muted">Moduł nie przesłał okna szybkiej rejestracji; chwila kontaktu pochodzi z {r.contactSource === 'imu_peak' ? 'zdarzenia imu_peak' : 'telemetrii (niska rozdzielczość)'}.</p>;
  }
  const xs = w.values.map((_, k) => (w.t0_us + k * w.dt_us - t0) / 1000);
  const marks: { t: number; label: string; color: string }[] = [
    { t: (r.disk_us - t0) / 1000, label: 'tarcza', color: cssVar('--s2') },
    ...(r.contact_us !== null ? [{ t: 0, label: 'kontakt', color: cssVar('--ink') }] : []),
  ];
  const relMarks = r.pushers.filter((p) => p.release_us !== null).map((p) => (p.release_us! - t0) / 1000);
  return (
    <UPlotChart
      key={rec.id}
      ariaLabel={`Okno szybkiej rejestracji ${w.ch}, ${Math.round(1e6 / w.dt_us)} Hz`}
      height={240}
      deps={[theme, rec.id]}
      version={() => 0}
      getData={() => [xs, w.values.map((v) => (Number.isFinite(v) ? v : null))] as uPlot.AlignedData}
      build={(width, height) => ({
        width,
        height,
        legend: { show: true, live: true },
        cursor: { drag: { x: true, y: false } },
        scales: { x: { time: false, min: Math.max(xs[0], -15), max: Math.min(xs[xs.length - 1], 30) } },
        plugins: [
          {
            hooks: {
              draw: [
                (u) => {
                  const ctx = u.ctx;
                  const dpr = devicePixelRatio || 1;
                  ctx.save();
                  ctx.font = `600 ${12 * dpr}px Barlow, system-ui, sans-serif`;
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'alphabetic';
                  for (const t of relMarks) {
                    const x = u.valToPos(t, 'x', true);
                    ctx.strokeStyle = cssVar('--s1');
                    ctx.globalAlpha = 0.6;
                    ctx.lineWidth = 1 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(x, u.bbox.top);
                    ctx.lineTo(x, u.bbox.top + 10 * dpr);
                    ctx.stroke();
                  }
                  ctx.globalAlpha = 1;
                  for (const m of marks) {
                    const x = u.valToPos(m.t, 'x', true);
                    ctx.strokeStyle = m.color;
                    ctx.lineWidth = 1.5 * dpr;
                    ctx.beginPath();
                    ctx.moveTo(x, u.bbox.top);
                    ctx.lineTo(x, u.bbox.top + u.bbox.height);
                    ctx.stroke();
                    ctx.fillStyle = cssVar('--ink-2');
                    ctx.fillText(m.label, x + 4 * dpr, u.bbox.top + 24 * dpr);
                  }
                  ctx.restore();
                },
              ],
            },
          },
        ],
        axes: [
          { ...axisStyle(), label: `czas od ${r.contact_us !== null ? 'kontaktu' : 'obrotu tarczy'} [ms]`, values: axisValues },
          { ...axisStyle(), label: `${w.ch} [g]`, size: 52, values: axisValues },
        ],
        series: [
          { label: 't [ms]', value: (_u, v) => (v === null ? '—' : fmt(v, 2)) },
          { label: `${w.ch} [g], ${Math.round(1e6 / w.dt_us)} Hz`, stroke: cssVar('--s1'), width: 1.5, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 2)) },
        ],
      })}
    />
  );
}

function Detail({ rec }: { rec: TrialRecord }) {
  const fmtCsv = useApp((s) => s.csvFormat);
  const d = rec.drop!;
  const r = d.result;
  const sim = d.simParams;
  return (
    <div className="grid" style={{ minWidth: 0 }}>
      <section className="sheet">
        <div className="sheet-head">
          <h2>Zdarzenie {rec.id}</h2>
          <span className="provenance">{fmtTime(rec.createdAt)}, {rec.source}{rec.scenario ? `: ${rec.scenario}` : ''}</span>
        </div>
        {r.notReachedEnd.length > 0 && (
          <p><Status tone="crit">Nie doszły do KONIEC: {r.notReachedEnd.map((n) => `P${n}`).join(', ')}</Status></p>
        )}
        <div className="readouts">
          <Readout label="Opóźnienie kontakt → tarcza" value={fmt(r.delayContactToDiskMs, 2)} unit="ms" sub={`kontakt: ${rec.summary.contactSource ?? '—'}`} />
          <Readout label="Rozrzut zwolnienia max−min" value={fmt(r.releaseSpreadMs, 3)} unit="ms" sub={sim ? `zadany w symulatorze: ${fmt(sim.spreadMs, 3)} ms` : `${r.releasedCount} popychaczy`} />
          <Readout label="Odchylenie std" value={fmt(r.releaseStdMs, 3)} unit="ms" sub="z próby, n − 1" />
          <Readout label="Zwolnione / w KONIEC" value={`${r.releasedCount} / ${r.pushers.filter((p) => p.reachedEnd).length}`} tone={r.notReachedEnd.length ? 'crit' : 'good'} sub="z 6 popychaczy" />
          <Readout label="Średni czas skoku" value={fmt(r.meanStrokeMs, 2)} unit="ms" sub={`średnia prędkość ${fmt(r.meanSpeedMS, 2)} m/s`} />
          <Readout label="Szczyt przyspieszenia" value={fmt(r.contactPeakG, 1)} unit="g" />
          <Readout
            label="Przechył po przyziemieniu"
            value={fmt(r.tiltAfterDeg, 1)}
            unit="°"
            tone={r.tiltAfterDeg !== null && r.tiltAfterDeg >= TIP_OVER_ANGLE_DEG ? 'crit' : undefined}
            sub={`alarm od ${fmt(TIP_OVER_ANGLE_DEG, 1)}°`}
          />
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-head">
          <h2>Oś czasu</h2>
          <span className="provenance">wyzwolenie z {r.triggerSource === 'event' ? 'zdarzenia disk' : 'telemetrii (zdarzenie disk nie dotarło)'}</span>
        </div>
        <Timeline r={r} />
        <div className="legend" style={{ marginTop: 6 }}>
          <span><i className="swatch" style={{ background: 'var(--ink)' }} /> zwolnienie (START → 0)</span>
          <span><i className="swatch" style={{ background: 'var(--s1)' }} /> skok do KONIEC</span>
          <span><i className="swatch" style={{ background: 'var(--s1-wash)', borderRadius: 2 }} /> rozrzut chwil zwolnienia</span>
          <span><i className="swatch" style={{ background: 'var(--crit)' }} /> brak KONIEC</span>
        </div>
      </section>

      <section className="sheet">
        <div className="sheet-head">
          <h2>Okno szybkiej rejestracji</h2>
          <span className="provenance">{d.windows.length ? (d.windowsComplete ? 'okno kompletne' : 'okno niekompletne (brak części porcji)') : 'brak okna'}</span>
        </div>
        <WindowChart rec={rec} />
      </section>

      <section className="sheet">
        <div className="sheet-head">
          <h2>Popychacze</h2>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={() => downloadText(`${rec.id}.csv`, trialCsv(rec, fmtCsv), 'text/csv;charset=utf-8')}>
              <Icon name="download" /> CSV próby
            </button>
            <button type="button" className="btn small" onClick={() => downloadText(`${rec.id}.json`, trialJson(rec), 'application/json')}>
              <Icon name="download" /> JSON
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Popychacz</th>
                <th>Zwolnienie wzgl. tarczy [ms]</th>
                <th>KONIEC wzgl. tarczy [ms]</th>
                <th>Czas skoku [ms]</th>
                <th>Prędkość [m/s]</th>
                <th>Stan</th>
              </tr>
            </thead>
            <tbody>
              {r.pushers.map((p) => (
                <tr key={p.n} data-tone={p.reachedEnd ? undefined : 'crit'}>
                  <td style={{ fontWeight: 600 }}>P{p.n}</td>
                  <td>{fmt(p.releaseAfterDiskMs, 3)}</td>
                  <td>{p.end_us !== null ? fmt((p.end_us - r.disk_us) / 1000, 3) : '—'}</td>
                  <td>{fmt(p.strokeMs, 3)}</td>
                  <td>{fmt(p.speedMS, 2)}</td>
                  <td style={{ textAlign: 'left' }}>
                    {p.reachedEnd ? <Status tone="good">KONIEC</Status> : p.leftStart ? <Status tone="crit">brak KONIEC</Status> : <Status tone="crit">nie opuścił START</Status>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ActivationPanel() {
  useApp((s) => s.tick);
  const trials = useApp((s) => s.trials);
  const sel = useApp((s) => s.selectedActivationId);
  const select = useApp((s) => s.selectActivation);
  const drops = trials.filter((t) => t.kind === 'zrzut');
  const rec = drops.find((t) => t.id === sel) ?? drops[0] ?? null;
  const connected = anchor.status === 'connected';

  return (
    <div className="grid act-layout">
      <div className="grid" style={{ minWidth: 0 }}>
        <section className="sheet" aria-live="polite">
          <h2>Rejestracja</h2>
          {!connected ? (
            <Status tone="muted">moduł kotwicy niepołączony</Status>
          ) : anchor.capturing ? (
            <Status tone="warn">trwa rejestracja zdarzenia</Status>
          ) : (
            <Status tone="good">czeka na obrót tarczy</Status>
          )}
          <p className="muted" style={{ fontSize: 'var(--t-s)', marginTop: 8 }}>
            Zbocze tarczy 0 → 1 otwiera zapis ramek z 1,5 s przed i 1,5 s po zdarzeniu oraz okna szybkiego z modułu.
          </p>
          <button type="button" className="btn small" disabled={!connected} onClick={() => void anchor.send('rearm').catch(() => undefined)}>
            Uzbrój rejestrację w module (rearm)
          </button>
        </section>
        <section className="sheet">
          <h2>Zdarzenia</h2>
          {drops.length === 0 ? (
            <p className="muted">Brak zarejestrowanych zdarzeń. Wykonaj zrzut kotwicy{isSimulated('anchor') ? ' przyciskiem w symulatorze' : ''}.</p>
          ) : (
            <ul className="list">
              {drops.map((t) => (
                <li key={t.id}>
                  <button type="button" aria-current={rec?.id === t.id ? 'true' : undefined} onClick={() => select(t.id)}>
                    <span className="t1">{t.id}</span>
                    <span className="t2">
                      rozrzut {fmt(t.summary.spreadMs as number | null, 3)} ms, {t.summary.reachedEnd ?? '—'}/6 w KONIEC
                    </span>
                    <span className="t2">{t.source}{t.scenario ? `: ${t.scenario}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AnchorSimControls />
      </div>
      {rec ? (
        <Detail rec={rec} />
      ) : (
        <section className="sheet">
          <div className="empty">
            <strong>Brak zdarzenia do wyświetlenia</strong>
            <span>Po obrocie tarczy pojawią się tu: oś czasu, rozrzut chwil zwolnienia, czasy skoku i okno szybkiej rejestracji.</span>
          </div>
        </section>
      )}
    </div>
  );
}
