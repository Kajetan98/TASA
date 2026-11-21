import { TILT_WARNING_FRACTION, TIP_OVER_ANGLE_DEG } from '../../config/tasa';
import { fmt } from '../format';

/** Wskaźnik przechyłu 0–90° z progiem przewrócenia 28,8°. */
export function TiltGauge({ tilt, stale, source }: { tilt: number | null; stale: boolean; source: string }) {
  const cx = 110;
  const cy = 104;
  const r = 86;
  // Łuk 180°: od lewej (0°, pion) do prawej (90°, poziom)
  const p = (d: number, rr = r) => {
    const a = Math.PI + (Math.max(0, Math.min(90, d)) / 90) * Math.PI;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const;
  };
  const arc = (d0: number, d1: number, rr = r) => {
    const [x0, y0] = p(d0, rr);
    const [x1, y1] = p(d1, rr);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const warnAt = TIP_OVER_ANGLE_DEG * TILT_WARNING_FRACTION;
  const tone = tilt === null ? 'muted' : tilt >= TIP_OVER_ANGLE_DEG ? 'crit' : tilt >= warnAt ? 'warn' : 'ok';
  const [nx, ny] = p(tilt ?? 0, r - 10);
  return (
    <svg viewBox="0 0 220 132" width="100%" style={{ maxWidth: 300, display: 'block' }} role="img" aria-label={`Przechył ${tilt === null ? 'brak danych' : fmt(tilt, 1) + '°'}`}>
      <path d={arc(0, 90)} stroke="var(--s1-wash)" strokeWidth="14" fill="none" />
      <path d={arc(warnAt, TIP_OVER_ANGLE_DEG)} stroke="var(--warn)" strokeWidth="14" fill="none" />
      <path d={arc(TIP_OVER_ANGLE_DEG, 90)} stroke="var(--crit)" strokeWidth="14" fill="none" />
      {[0, 30, 60, 90].map((d) => {
        const [x0, y0] = p(d, r + 9);
        const [x1, y1] = p(d, r + 3);
        const [tx, ty] = p(d, r + 20);
        return (
          <g key={d}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--ink-3)" strokeWidth="1" />
            <text x={tx} y={ty + 4} fontSize="10" textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--f-ui)">{d}°</text>
          </g>
        );
      })}
      {tilt !== null && (
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={stale ? 'var(--ink-3)' : 'var(--ink)'} strokeWidth="3" strokeLinecap="round" />
      )}
      <circle cx={cx} cy={cy} r={5} fill="var(--ink)" />
      <text x={cx} y={cy - 26} textAnchor="middle" fontSize="24" fontWeight="600" fill={tone === 'crit' ? 'var(--crit-text)' : 'var(--ink)'} fontFamily="var(--f-ui)" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {tilt === null ? '—' : `${fmt(tilt, 1)}°`}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily="var(--f-ui)">{source}</text>
    </svg>
  );
}
