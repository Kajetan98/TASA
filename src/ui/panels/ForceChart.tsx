import type uPlot from 'uplot';
import { COCK_STROKE_MM, CONTACT_FORCE_N, OVERLOAD_FORCE_N, SLOPE_TOLERANCE } from '../../config/tasa';
import type { StationCycle } from '../../domain/stationAnalysis';
import { station } from '../../store/app';
import { axisStyle, cssVar, UPlotChart } from '../components/UPlotChart';
import { axisValues, fmt } from '../format';
import { useResolvedTheme } from '../hooks';

/**
 * Wykres F(x) bieżącego cyklu: naciąg w kolejnych próbach, cofnięcie, rozładowanie,
 * charakterystyka oczekiwana z pasem tolerancji ±10% oraz linie 20 N i 1600 N.
 */

const N_SERIES = 7; // a1, a2, cofnięcie, rozładowanie, oczekiwana, tol+, tol−

export function buildForceData(c: StationCycle | null): uPlot.AlignedData {
  const pts: [number, number, number][] = []; // x, seria, F
  if (c) {
    let attempt = 0;
    let prev: number | null = null;
    for (const r of c.rows) {
      if (r.stage === 4 && prev !== 4) attempt++;
      prev = r.stage;
      if (r.F === null) continue;
      if (r.stage === 4) pts.push([r.x, attempt <= 1 ? 0 : 1, r.F]);
      else if (r.stage === 5) pts.push([r.x, 2, r.F]);
      else if (r.stage === 8 && r.F > CONTACT_FORCE_N) pts.push([r.x, 3, r.F]);
    }
    const a = c.attempts[c.attempts.length - 1];
    if (a && a.anchorX !== null && a.anchorF !== null) {
      const x1 = a.x0 + COCK_STROKE_MM;
      const dx = x1 - a.anchorX;
      pts.push([a.anchorX, 4, a.anchorF], [x1, 4, a.anchorF + a.expectedSlope * dx]);
      pts.push([a.anchorX, 5, a.anchorF], [x1, 5, a.anchorF + a.expectedSlope * (1 + SLOPE_TOLERANCE) * dx]);
      pts.push([a.anchorX, 6, a.anchorF], [x1, 6, a.anchorF + a.expectedSlope * (1 - SLOPE_TOLERANCE) * dx]);
    }
  }
  pts.sort((p, q) => p[0] - q[0]);
  const xs = new Array<number>(pts.length);
  const ys: (number | null)[][] = Array.from({ length: N_SERIES }, () => new Array(pts.length).fill(null));
  pts.forEach((p, i) => {
    xs[i] = p[0];
    ys[p[1]][i] = p[2];
  });
  return [xs, ...ys] as uPlot.AlignedData;
}

export function ForceChart({ height = 360 }: { height?: number }) {
  const theme = useResolvedTheme();
  return (
    <UPlotChart
      ariaLabel="Siła na płycie w funkcji położenia płyty z charakterystyką oczekiwaną"
      height={height}
      deps={[theme]}
      version={() => station.rowVersion + (station.lastCycle ? 1e9 : 0)}
      getData={() => buildForceData(station.displayCycle)}
      build={(width, h) => {
        const ink2 = cssVar('--ink-2');
        const crit = cssVar('--crit');
        const thresholds: uPlot.Plugin = {
          hooks: {
            draw: [
              (u) => {
                const ctx = u.ctx;
                const { left, width: w } = u.bbox;
                const dpr = devicePixelRatio || 1;
                ctx.save();
                ctx.font = `${12 * dpr}px Barlow, system-ui, sans-serif`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
                for (const [v, col, label] of [
                  [CONTACT_FORCE_N, ink2, `${CONTACT_FORCE_N} N: oparcie / siła resztkowa`],
                  [OVERLOAD_FORCE_N, crit, `${OVERLOAD_FORCE_N} N: przeciążenie`],
                ] as [number, string, string][]) {
                  const y = u.valToPos(v, 'y', true);
                  if (y < u.bbox.top || y > u.bbox.top + u.bbox.height) continue;
                  ctx.strokeStyle = col;
                  ctx.lineWidth = 1.5 * dpr;
                  ctx.setLineDash([6 * dpr, 4 * dpr]);
                  ctx.beginPath();
                  ctx.moveTo(left, y);
                  ctx.lineTo(left + w, y);
                  ctx.stroke();
                  ctx.setLineDash([]);
                  ctx.fillStyle = col;
                  ctx.fillText(label, left + 6 * dpr, y - 5 * dpr);
                }
                ctx.restore();
              },
            ],
          },
        };
        return {
          width,
          height: h,
          plugins: [thresholds],
          legend: { show: true, live: true },
          cursor: { drag: { x: true, y: false } },
          scales: {
            x: { time: false },
            y: { auto: true, range: (_u, _lo, hi) => [-60, Math.max(1700, (hi ?? 0) * 1.05)] },
          },
          axes: [
            { ...axisStyle(), label: 'położenie płyty x [mm]', values: axisValues },
            { ...axisStyle(), label: 'siła F [N]', size: 60, values: axisValues },
          ],
          bands: [{ series: [5, 6], fill: cssVar('--band') }],
          series: [
            { label: 'x [mm]', value: (_u, v) => (v === null ? '—' : fmt(v, 2)) },
            { label: 'naciąg, próba 1', stroke: cssVar('--s1'), width: 2, spanGaps: true, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 1)) },
            { label: 'naciąg, próba 2', stroke: cssVar('--s2'), width: 2, spanGaps: true, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 1)) },
            { label: 'cofnięcie (siła resztkowa)', stroke: cssVar('--s3'), width: 2, spanGaps: true, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 1)) },
            { label: 'rozładowanie', stroke: ink2, width: 2, dash: [2, 3], spanGaps: true, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 1)) },
            { label: 'oczekiwana', stroke: cssVar('--ink'), width: 1, spanGaps: true, points: { show: false }, value: (_u, v) => (v === null ? '—' : fmt(v, 1)) },
            { label: 'tolerancja +10%', stroke: cssVar('--rule-strong'), width: 1, spanGaps: true, points: { show: false }, show: true },
            { label: 'tolerancja −10%', stroke: cssVar('--rule-strong'), width: 1, spanGaps: true, points: { show: false }, show: true },
          ],
        };
      }}
    />
  );
}
