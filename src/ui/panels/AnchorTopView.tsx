import { PUSHER_COUNT, RELEASE_DISK_ANGLE_DEG } from '../../config/tasa';
import type { AnchorStateResult } from '../../domain/anchorState';
import { pusherBit } from '../../protocol/anchorFrames';

/**
 * Widok kotwicy z góry (schemat): piasta z tarczą zwalniającą, sześć rur prowadzących,
 * na każdej dwa czujniki Halla (START przy piaście, KONIEC na zewnątrz) i popychacz.
 * Rury pochylone o ψ = 30° w rzucie wyglądają jak promienie; odległości są schematyczne.
 */

const C = 200;
const R_TUBE0 = 66;
const R_TUBE1 = 168;
const R_START = 86;
const R_END = 148;
const deg = Math.PI / 180;

const posColor = {
  start: 'var(--ink)',
  end: 'var(--s1)',
  mid: 'var(--warn)',
  fault: 'var(--crit)',
} as const;

const posLabel = { start: 'START', end: 'KONIEC', mid: 'pośrednie', fault: 'błąd' } as const;

export function AnchorTopView({ st, hs, he }: { st: AnchorStateResult; hs: number | null; he: number | null }) {
  const diskRot = st.disk === 1 ? RELEASE_DISK_ANGLE_DEG : 0;
  const tubes = Array.from({ length: PUSHER_COUNT }, (_, i) => {
    const a = (-90 + i * 60) * deg;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const p = (r: number) => [C + ux * r, C + uy * r] as const;
    return { i, n: i + 1, a, ux, uy, p };
  });
  const noData = hs === null;

  return (
    <svg className="topview" viewBox="0 0 400 400" role="img" aria-label={`Widok z góry: ${st.label}`}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warn)" strokeWidth="3" />
        </pattern>
      </defs>
      <g opacity={st.stale ? 0.45 : 1}>
        {/* pierścień dolny kosza */}
        <circle cx={C} cy={C} r={178} fill="none" stroke="var(--rule)" strokeWidth="1.5" strokeDasharray="3 5" />

        {tubes.map((t) => {
          const [x0, y0] = t.p(R_TUBE0);
          const [x1, y1] = t.p(R_TUBE1);
          const s = noData ? null : pusherBit(hs!, t.n);
          const e = noData ? null : pusherBit(he!, t.n);
          const pos = st.pushers[t.i];
          const rPusher = pos === 'start' ? R_START : pos === 'end' ? R_END : (R_START + R_END) / 2;
          const [px, py] = t.p(rPusher);
          const [sx, sy] = t.p(R_START);
          const [ex, ey] = t.p(R_END);
          const [lx, ly] = t.p(188);
          const flagged = st.notAtEnd.includes(t.n);
          const rotDeg = (t.a / deg);
          return (
            <g key={t.n}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--rule-strong)" strokeWidth="14" strokeLinecap="round" />
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--sheet)" strokeWidth="10" strokeLinecap="round" />
              {/* czujniki Halla */}
              {[
                { x: sx, y: sy, on: s, label: 'START' },
                { x: ex, y: ey, on: e, label: 'KONIEC' },
              ].map((h) => (
                <g key={h.label} transform={`translate(${h.x},${h.y}) rotate(${rotDeg})`}>
                  <rect
                    x={-3}
                    y={-12}
                    width={6}
                    height={24}
                    rx={1}
                    fill={h.on ? 'var(--ink)' : 'var(--sheet)'}
                    stroke={h.on === null ? 'var(--rule-strong)' : 'var(--ink-2)'}
                    strokeDasharray={h.on === null ? '2 2' : undefined}
                    strokeWidth="1.2"
                  />
                </g>
              ))}
              {/* popychacz */}
              {!noData && (
                <g transform={`translate(${px},${py}) rotate(${rotDeg})`}>
                  <rect
                    x={-11}
                    y={-6}
                    width={22}
                    height={12}
                    rx={3}
                    fill={pos === 'mid' ? 'url(#hatch)' : posColor[pos]}
                    stroke={pos === 'mid' ? 'var(--warn-text)' : 'var(--sheet)'}
                    strokeWidth="2"
                  />
                </g>
              )}
              <circle cx={lx} cy={ly} r={13} fill={flagged ? 'var(--crit-wash)' : 'var(--sheet)'} stroke={flagged ? 'var(--crit)' : 'var(--rule-strong)'} strokeWidth={flagged ? 2 : 1} />
              <text x={lx} y={ly + 4.5} textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--ink)" fontFamily="var(--f-ui)">
                P{t.n}
              </text>
              <title>{`P${t.n}: ${noData ? 'brak danych' : posLabel[pos]} (START ${s ? 1 : 0}, KONIEC ${e ? 1 : 0})`}</title>
            </g>
          );
        })}

        {/* piasta i tarcza zwalniająca */}
        <circle cx={C} cy={C} r={54} fill="var(--sheet-2)" stroke="var(--rule-strong)" strokeWidth="1.5" />
        <g transform={`rotate(${diskRot} ${C} ${C})`} style={{ transition: 'transform 220ms ease-out' }}>
          <circle cx={C} cy={C} r={40} fill="var(--sheet)" stroke={st.disk === 1 ? 'var(--s1)' : 'var(--ink)'} strokeWidth="2.5" />
          {tubes.map((t) => {
            const [x, y] = [C + Math.cos(t.a) * 40, C + Math.sin(t.a) * 40];
            return <circle key={t.n} cx={x} cy={y} r={4.5} fill={st.disk === 1 ? 'var(--s1)' : 'var(--ink)'} />;
          })}
          <line x1={C} y1={C - 34} x2={C} y2={C - 18} stroke={st.disk === 1 ? 'var(--s1)' : 'var(--ink)'} strokeWidth="3" strokeLinecap="round" />
        </g>
        {st.pin === 1 && (
          <g>
            <rect x={C - 30} y={C - 4} width={96} height={8} rx={4} fill="var(--crit)" />
            <text x={C + 72} y={C + 4} fontSize="12" fill="var(--crit-text)" fontWeight="600" fontFamily="var(--f-ui)">
              zawleczka
            </text>
          </g>
        )}
        <text x={C - 62} y={C + 4} textAnchor="end" fontSize="12" fill="var(--ink-2)" fontFamily="var(--f-ui)">
          {st.disk === null ? 'tarcza: brak' : st.disk === 1 ? `tarcza +${RELEASE_DISK_ANGLE_DEG}°` : 'tarcza 0°'}
        </text>
      </g>
    </svg>
  );
}

export const PUSHER_POS_LABEL = posLabel;
export const PUSHER_POS_COLOR = posColor;
