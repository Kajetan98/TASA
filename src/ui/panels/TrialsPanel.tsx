import { useEffect, useState } from 'react';
import { downloadText, summaryCsv, trialCsv, trialJson } from '../../export/csv';
import { SUMMARY_COLUMNS } from '../../export/summaryColumns';
import type { TrialKind, TrialRecord } from '../../store/trials';
import { useApp } from '../../store/app';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { fmtTime } from '../format';

const BADANIA = ['B3', 'B3a', 'B3b', 'B3c', 'B4', 'B10', 'B11', 'inne'];

function keyResult(t: TrialRecord): string {
  if (t.kind === 'zrzut') {
    const s = t.summary;
    return `rozrzut ${s.spreadMs ?? '—'} ms, ${s.reachedEnd ?? '—'}/6 w KONIEC`.replace('.', ',');
  }
  return String(t.summary.result ?? '—');
}

function Editor({ t }: { t: TrialRecord }) {
  const patch = useApp((s) => s.patchTrial);
  const [badanie, setBadanie] = useState(t.params.badanie);
  const [wys, setWys] = useState(t.params.wysokoscM === null ? '' : String(t.params.wysokoscM));
  const [uwagi, setUwagi] = useState(t.params.uwagi);
  useEffect(() => {
    setBadanie(t.params.badanie);
    setWys(t.params.wysokoscM === null ? '' : String(t.params.wysokoscM));
    setUwagi(t.params.uwagi);
  }, [t.id, t.params.badanie, t.params.wysokoscM, t.params.uwagi]);
  const dirty = badanie !== t.params.badanie || uwagi !== t.params.uwagi || wys !== (t.params.wysokoscM === null ? '' : String(t.params.wysokoscM));
  const save = () => {
    const w = wys.trim() === '' ? null : Number(wys.replace(',', '.'));
    void patch({ ...t, params: { badanie, wysokoscM: w !== null && Number.isFinite(w) ? w : null, uwagi } });
  };
  return (
    <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      <label className="field">
        <span>Badanie</span>
        <select value={badanie} onChange={(e) => setBadanie(e.target.value)}>
          {BADANIA.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      {t.kind === 'zrzut' && (
        <label className="field">
          <span>Wysokość zrzutu [m]</span>
          <input type="number" step="0.01" value={wys} onChange={(e) => setWys(e.target.value)} />
        </label>
      )}
      <label className="field" style={{ gridColumn: '1 / -1' }}>
        <span>Uwagi</span>
        <textarea value={uwagi} onChange={(e) => setUwagi(e.target.value)} />
      </label>
      <div className="btn-row">
        <button type="button" className="btn small primary" disabled={!dirty} onClick={save}>Zapisz parametry</button>
      </div>
    </div>
  );
}

export function TrialsPanel() {
  const trials = useApp((s) => s.trials);
  const selId = useApp((s) => s.selectedTrialId);
  const select = useApp((s) => s.selectTrial);
  const remove = useApp((s) => s.removeTrial);
  const fmtCsv = useApp((s) => s.csvFormat);
  const setFmt = useApp((s) => s.setCsvFormat);
  const [filter, setFilter] = useState<TrialKind | 'all'>('all');
  const [confirmDel, setConfirmDel] = useState(false);
  const shown = trials.filter((t) => filter === 'all' || t.kind === filter);
  const sel = trials.find((t) => t.id === selId) ?? null;
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid trials-layout">
      <section className="sheet" style={{ minWidth: 0 }}>
        <div className="sheet-head">
          <h2>Rejestr prób</h2>
          <div className="btn-row">
            <div className="segmented" role="group" aria-label="Rodzaj próby">
              {(['all', 'uzbrojenie', 'rozładowanie', 'zrzut'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'wszystkie' : k}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <span className="muted" style={{ fontSize: 'var(--t-s)' }}>Format CSV:</span>
          <div className="segmented" role="group" aria-label="Format CSV">
            <button type="button" aria-pressed={fmtCsv === 'pl'} onClick={() => setFmt('pl')}>PL (średnik, przecinek)</button>
            <button type="button" aria-pressed={fmtCsv === 'intl'} onClick={() => setFmt('intl')}>międzynarodowy</button>
          </div>
          <button type="button" className="btn small" disabled={!shown.length} onClick={() => downloadText(`tasa_podsumowanie_${stamp}.csv`, summaryCsv(shown, fmtCsv), 'text/csv;charset=utf-8')}>
            <Icon name="download" /> CSV podsumowania ({shown.length})
          </button>
          <button type="button" className="btn small" disabled={!shown.length} onClick={() => downloadText(`tasa_proby_${stamp}.json`, trialJson(shown), 'application/json')}>
            <Icon name="download" /> JSON wszystkich
          </button>
        </div>
        {shown.length === 0 ? (
          <div className="empty">
            <strong>Rejestr jest pusty</strong>
            <span>Rekord powstaje automatycznie po każdym cyklu uzbrajania, rozładowaniu i zarejestrowanym zrzucie. Dane są przechowywane w tej przeglądarce (IndexedDB).</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table trial-table">
              <thead>
                <tr>
                  <th>Id</th>
                  <th>Data i godzina</th>
                  <th>Rodzaj</th>
                  <th>Badanie</th>
                  <th>Źródło</th>
                  <th>Wynik</th>
                  <th>Alarmy</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} aria-selected={t.id === selId} onClick={() => select(t.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.id); } }}>
                    <td style={{ fontWeight: 600 }}>{t.id}</td>
                    <td>{fmtTime(t.createdAt)}</td>
                    <td>{t.kind}</td>
                    <td>{t.params.badanie}</td>
                    <td>{t.source}{t.scenario ? `: ${t.scenario}` : ''}</td>
                    <td>{keyResult(t)}</td>
                    <td>{(t.summary.alarms as string | null) ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="sheet" style={{ minWidth: 0 }}>
        {sel ? (
          <>
            <div className="sheet-head">
              <h2>{sel.id}</h2>
              <span className="provenance">{fmtTime(sel.createdAt)}</span>
            </div>
            <Editor t={sel} />
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <button type="button" className="btn small" onClick={() => downloadText(`${sel.id}.csv`, trialCsv(sel, fmtCsv), 'text/csv;charset=utf-8')}>
                <Icon name="download" /> CSV próby (komplet danych)
              </button>
              <button type="button" className="btn small" onClick={() => downloadText(`${sel.id}.json`, trialJson(sel), 'application/json')}>
                <Icon name="download" /> JSON próby
              </button>
              <button type="button" className="btn small danger" onClick={() => setConfirmDel(true)}>Usuń</button>
            </div>
            <dl className="kv">
              {SUMMARY_COLUMNS.map((c) => {
                const v = c.get(sel);
                if (v === null || v === '' || v === undefined) return null;
                return (
                  <div key={c.label} style={{ display: 'contents' }}>
                    <dt>{c.label}</dt>
                    <dd>{typeof v === 'number' ? v.toLocaleString('pl-PL', { maximumFractionDigits: 3, useGrouping: false }) : v}</dd>
                  </div>
                );
              })}
              <dt>Dane surowe</dt>
              <dd>
                {sel.station ? `${sel.station.rows.length} wierszy LOG, ${sel.station.alarms.length} alarmów` : ''}
                {sel.drop ? `${sel.drop.frames.length} ramek, okno ${sel.drop.windows.map((w) => `${w.received}/${w.n}`).join(', ') || 'brak'}` : ''}
              </dd>
            </dl>
            <ConfirmDialog
              open={confirmDel}
              title={`Usunąć rekord ${sel.id}?`}
              tone="danger"
              confirmLabel="Usuń rekord"
              onCancel={() => setConfirmDel(false)}
              onConfirm={() => {
                setConfirmDel(false);
                void remove(sel.id);
              }}
            >
              <p>Rekord zostanie usunięty z pamięci przeglądarki. Przed usunięciem możesz pobrać CSV lub JSON.</p>
            </ConfirmDialog>
          </>
        ) : (
          <div className="empty">
            <strong>Wybierz próbę z listy</strong>
            <span>Szczegóły, parametry (badanie, wysokość, uwagi) i eksport pojedynczej próby.</span>
          </div>
        )}
      </section>
    </div>
  );
}
