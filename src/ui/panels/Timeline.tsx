import type { ActivationResult } from '../../domain/activation';
import { fmt } from '../format';

/**
 * Oś czasu zdarzenia: szczyt IMU (kontakt), obrót tarczy, odcinki START → KONIEC popychaczy.
 * Czas względem kontaktu (gdy znany) albo względem obrotu tarczy; wszystkie znaczniki z µC.
 */
export function Timeline({ r }: { r: ActivationResult }) {
  const t0 = r.contact_us ?? r.disk_us;
  const rel = (us: number) => (us - t0) / 1000;
  const ends = r.pushers.flatMap((p) => [p.release_us, p.end_us]).filter((v): v is number => v !== null).map(rel);
  const tMin = Math.min(-1, rel(r.disk_us) - 1, ...(r.contact_us !== null ? [-1] : []));
  const tMax = Math.max(rel(r.disk_us) + 2, ...ends) + 1.5;
  const W = 900;
  const L = 64;
  const Rm = 16;
  const rowH = 26;
  const top = 34;
  const H = top + 6 * rowH + 44;
  const X = (t: number) => L + ((t - tMin) / (tMax - tMin)) * (W - L - Rm);
  const span = tMax - tMin;
  const step = span > 40 ? 10 : span > 16 ? 5 : span > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) ticks.push(t);
  const relMin = Math.min(...r.pushers.filter((p) => p.release_us !== null).map((p) => rel(p.release_us!)));
  const relMax = Math.max(...r.pushers.filter((p) => p.release_us !== null).map((p) => rel(p.release_us!)));

  return (
    <svg className="timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Oś czasu zdarzenia wyzwolenia">
      <defs>
        <pattern id="tl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--crit)" strokeWidth="2" />
        </pattern>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={top - 6} y2={top + 6 * rowH} stroke="var(--rule)" strokeWidth={1} />
          <text x={X(t)} y={H - 18} textAnchor="middle" fontSize="11" fill="var(--ink-3)" fontFamily="var(--f-ui)">{fmt(t, 0)}</text>
        </g>
      ))}
      <text x={W - Rm} y={H - 2} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--f-ui)">
        czas od {r.contact_us !== null ? 'kontaktu (szczyt IMU)' : 'obrotu tarczy'} [ms], znaczniki µC
      </text>
      {/* rozrzut chwil zwolnienia */}
      {Number.isFinite(relMin) && relMax > relMin && (
        <rect x={X(relMin)} y={top - 4} width={Math.max(1, X(relMax) - X(relMin))} height={6 * rowH + 4} fill="var(--s1-wash)" />
      )}
      {r.pushers.map((p, i) => {
        const y = top + i * rowH;
        const hasRel = p.release_us !== null;
        const x1 = hasRel ? X(rel(p.release_us!)) : null;
        const x2 = p.end_us !== null ? X(rel(p.end_us)) : X(tMax);
        return (
          <g key={p.n}>
            <text x={L - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize="12.5" fontWeight="600" fill={p.reachedEnd ? 'var(--ink)' : 'var(--crit-text)'} fontFamily="var(--f-ui)">P{p.n}</text>
            <line x1={L} x2={W - Rm} y1={y + rowH / 2} y2={y + rowH / 2} stroke="var(--rule)" strokeWidth={1} />
            {x1 !== null && (
              <>
                <rect x={x1} y={y + 6} width={Math.max(2, x2 - x1)} height={rowH - 12} rx={3} fill={p.reachedEnd ? 'var(--s1)' : 'url(#tl-hatch)'} stroke={p.reachedEnd ? 'none' : 'var(--crit)'} />
                <circle cx={x1} cy={y + rowH / 2} r={4} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={2} />
                {p.reachedEnd && <circle cx={x2} cy={y + rowH / 2} r={4} fill="var(--s1)" stroke="var(--sheet)" strokeWidth={2} />}
              </>
            )}
            {!p.reachedEnd && (
              <text x={x1 !== null ? Math.min(W - Rm - 4, x1 + 8) : L + 8} y={y + rowH / 2 + 4} fontSize="11.5" fill="var(--crit-text)" fontWeight="600" fontFamily="var(--f-ui)" textAnchor={x1 !== null && x1 > W - 220 ? 'end' : 'start'} dx={x1 !== null && x1 > W - 220 ? -16 : 0}>
                {hasRel ? 'brak KONIEC' : 'nie opuścił START, brak KONIEC'}
              </text>
            )}
          </g>
        );
      })}
      {r.contact_us !== null && (
        <g>
          <line x1={X(0)} x2={X(0)} y1={top - 14} y2={top + 6 * rowH} stroke="var(--ink)" strokeWidth={2} />
          <text x={X(0)} y={top - 18} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--f-ui)">kontakt</text>
        </g>
      )}
      <g>
        <line x1={X(rel(r.disk_us))} x2={X(rel(r.disk_us))} y1={top - 14} y2={top + 6 * rowH} stroke="var(--s2)" strokeWidth={2} />
        <text x={X(rel(r.disk_us))} y={top - 18} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--f-ui)">tarcza</text>
      </g>
    </svg>
  );
}
