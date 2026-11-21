/** Formatowanie liczb w interfejsie (polski przecinek dziesiętny). */

export function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (Object.is(Number(v.toFixed(digits)), -0) || Number(v.toFixed(digits)) === 0) v = 0;
  return v.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}

export function fmtSigned(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return (r > 0 ? '+' : r < 0 ? '−' : '') + fmt(Math.abs(r), digits);
}

/** Etykiety podziałki osi: liczba miejsc po przecinku dobrana do kroku podziałki. */
export function axisValues(_u: unknown, vals: number[]): string[] {
  const step = vals.length > 1 ? Math.abs(vals[1] - vals[0]) : 1;
  let d = 0;
  while (d < 3 && Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) > 1e-6) d++;
  return vals.map((v) => fmt(v === 0 ? 0 : v, d));
}

/** Wiek ramki: "12 ms", "1,3 s", "brak". */
export function fmtAge(ms: number | null): string {
  if (ms === null) return 'brak ramek';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${fmt(ms / 1000, 1)} s`;
  return `${Math.floor(ms / 60_000)} min`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
