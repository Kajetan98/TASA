import { stageInfo } from '../config/tasa';
import { alarmInfo } from '../domain/alarms';
import type { SummaryValue, TrialRecord } from '../store/trials';
import { localDateTime } from './format';
import { SUMMARY_COLUMNS } from './summaryColumns';

export { localDateTime };

/**
 * Eksport CSV. Format "pl": separator średnik, przecinek dziesiętny (domyślny arkusz w polskich
 * ustawieniach regionalnych); "intl": przecinek i kropka dziesiętna. Plik zaczyna się znacznikiem BOM,
 * aby arkusz rozpoznał UTF-8 i polskie znaki.
 */

export type CsvFormat = 'pl' | 'intl';

const BOM = '﻿';

export function formatNumber(v: number, fmt: CsvFormat): string {
  if (!Number.isFinite(v)) return '';
  const s = Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)));
  return fmt === 'pl' ? s.replace('.', ',') : s;
}

export function cell(v: SummaryValue | boolean | undefined, fmt: CsvFormat): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'tak' : 'nie';
  if (typeof v === 'number') return formatNumber(v, fmt);
  const sep = fmt === 'pl' ? ';' : ',';
  return /["\n\r]/.test(v) || v.includes(sep) ? `"${v.replace(/"/g, '""')}"` : v;
}

function rowsToCsv(rows: (SummaryValue | boolean | undefined)[][], fmt: CsvFormat): string {
  const sep = fmt === 'pl' ? ';' : ',';
  return rows.map((r) => r.map((c) => cell(c, fmt)).join(sep)).join('\r\n');
}


/** Podsumowanie: jeden wiersz na próbę, kolumny według SUMMARY_COLUMNS. */
export function summaryCsv(trials: TrialRecord[], fmt: CsvFormat): string {
  const header = SUMMARY_COLUMNS.map((c) => c.label);
  const rows = trials.map((t) => SUMMARY_COLUMNS.map((c) => c.get(t)));
  return BOM + rowsToCsv([header, ...rows], fmt) + '\r\n';
}

/** Komplet danych jednej próby: metadane, wyniki i dane surowe w sekcjach. */
export function trialCsv(t: TrialRecord, fmt: CsvFormat): string {
  const out: (SummaryValue | boolean | undefined)[][] = [];
  out.push(['Próba', t.id]);
  out.push(['Rodzaj', t.kind]);
  out.push(['Data i godzina', localDateTime(t.createdAt)]);
  out.push(['Źródło danych', t.source]);
  out.push(['Scenariusz / wariant', t.scenario]);
  out.push(['Badanie', t.params.badanie]);
  out.push(['Wysokość zrzutu [m]', t.params.wysokoscM]);
  out.push(['Uwagi', t.params.uwagi]);
  out.push([]);
  out.push(['Wyniki']);
  for (const c of SUMMARY_COLUMNS) {
    if (c.common) continue;
    const v = c.get(t);
    if (v !== null && v !== undefined && v !== '') out.push([c.label, v]);
  }

  if (t.station) {
    const s = t.station;
    out.push([]);
    out.push(['Próby naciągu']);
    out.push(['Próba', 'x oparcia [mm]', 'Nachylenie [N/mm]', 'Nachylenie oczekiwane [N/mm]', 'Źródło oczekiwanego', 'Odchyłka [%]', 'Siła szczytowa [N]', 'Skok [mm]', 'Siła resztkowa [N]', 'R²']);
    for (const a of s.attempts) {
      out.push([a.index, a.x0, a.fit?.slope ?? null, a.expectedSlope, a.expectedSource, a.slopeDevPct, a.peakF, a.stroke, a.residualF, a.fit?.r2 ?? null]);
    }
    out.push([]);
    out.push(['Alarmy']);
    out.push(['t sterownika [s]', 'Kod', 'Opis', 'Wiersz sterownika', 'Czas odbioru']);
    for (const a of s.alarms) out.push([a.t, a.code, alarmInfo(a.code).title, a.text, localDateTime(a.at)]);
    out.push([]);
    out.push(['Dane LOG']);
    out.push(['t [s]', 'Etap', 'Opis etapu', 'x [mm]', 'F [N]']);
    for (const r of s.rows) out.push([r.t, r.stage, stageInfo(r.stage).short, r.x, r.F]);
  }

  if (t.drop) {
    const d = t.drop;
    const t0 = d.result.disk_us;
    const rel = (us: number) => (us - t0) / 1000;
    out.push([]);
    out.push(['Popychacze']);
    out.push(['Popychacz', 'Zwolnienie względem tarczy [ms]', 'KONIEC względem tarczy [ms]', 'Czas skoku [ms]', 'Prędkość średnia [m/s]', 'Opuścił START', 'Doszedł do KONIEC', 'Zwolnienie t_us', 'KONIEC t_us']);
    for (const p of d.result.pushers) {
      out.push([`P${p.n}`, p.releaseAfterDiskMs, p.end_us !== null ? rel(p.end_us) : null, p.strokeMs, p.speedMS, p.leftStart, p.reachedEnd, p.release_us, p.end_us]);
    }
    out.push([]);
    out.push(['Zdarzenia']);
    out.push(['t_us', 't względem tarczy [ms]', 'Źródło', 'Kanał', 'Położenie', 'Wartość']);
    for (const f of d.frames) if (f.type === 'event') out.push([f.t_us, rel(f.t_us), f.src, f.ch, f.pos, f.val]);
    out.push([]);
    out.push(['Telemetria']);
    out.push(['t_us', 't względem tarczy [ms]', 'ax [g]', 'ay [g]', 'az [g]', 'Przechył firmware [°]', 'START (maska)', 'KONIEC (maska)', 'Tarcza', 'Zawleczka']);
    for (const f of d.frames) {
      if (f.type !== 'telemetry') continue;
      out.push([f.t_us, rel(f.t_us), f.acc?.[0] ?? null, f.acc?.[1] ?? null, f.acc?.[2] ?? null, f.tilt, f.hs, f.he, f.disk, f.pin]);
    }
    for (const w of d.windows) {
      out.push([]);
      out.push([`Okno szybkie: ${w.ch}, ${Math.round(1e6 / w.dt_us)} Hz, ${w.received}/${w.n} próbek`]);
      out.push(['t_us', 't względem tarczy [ms]', `${w.ch}`]);
      for (let k = 0; k < w.n; k++) {
        const tu = w.t0_us + k * w.dt_us;
        out.push([tu, rel(tu), Number.isFinite(w.values[k]) ? w.values[k] : null]);
      }
    }
  }
  return BOM + rowsToCsv(out, fmt) + '\r\n';
}

export function downloadText(name: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function trialJson(trials: TrialRecord | TrialRecord[]): string {
  return JSON.stringify(trials, null, 1);
}
