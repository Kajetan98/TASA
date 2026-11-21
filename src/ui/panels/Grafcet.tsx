import { STAGES } from '../../config/tasa';

/**
 * Sekwencja uzbrajania w konwencji GRAFCET (praca, Rys. 20): etap początkowy w podwójnej ramce,
 * etap aktywny wypełniony i oznaczony znacznikiem, przejścia z warunkami.
 */

const W = 960;
const S = 46;
const X = (i: number) => 34 + i * 126;
const Y1 = 40;
const Y2 = 138;

interface Pos { x: number; y: number }
const POS: Record<number, Pos> = {
  0: { x: X(0), y: Y1 }, 1: { x: X(1), y: Y1 }, 2: { x: X(2), y: Y1 }, 3: { x: X(3), y: Y1 },
  4: { x: X(4), y: Y1 }, 5: { x: X(5), y: Y1 }, 6: { x: X(6), y: Y1 },
  7: { x: X(4), y: Y2 }, 8: { x: X(6), y: Y2 },
};

const COND: Record<string, string> = {
  '0-1': 'START, S3, S6',
  '1-2': 'S4',
  '2-3': 'S5',
  '3-4': 'F > 20 N',
  '4-5': 'S2',
  '5-6': 'F < 20 N',
};

export function Grafcet({ active, visited, alarm }: { active: number | null; visited: number[]; alarm: boolean }) {
  const step = (id: number) => {
    const p = POS[id];
    const isActive = active === id;
    const fill = isActive ? (alarm ? 'var(--crit)' : 'var(--ink)') : 'var(--sheet)';
    const txt = isActive ? 'var(--sheet)' : 'var(--ink)';
    const info = STAGES.find((s) => s.id === id)!;
    return (
      <g key={id} aria-label={`Etap ${id}: ${info.description}${isActive ? ' (aktywny)' : ''}`}>
        <rect x={p.x} y={p.y} width={S} height={S} fill={fill} stroke="var(--ink)" strokeWidth={visited.includes(id) && !isActive ? 2.5 : 1.5} />
        {id === 0 && <rect x={p.x + 4} y={p.y + 4} width={S - 8} height={S - 8} fill="none" stroke={txt} strokeWidth={1.2} />}
        <text x={p.x + S / 2} y={p.y + S / 2 + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill={txt} fontFamily="var(--f-display)">
          {id}
        </text>
        {isActive && <circle cx={p.x + S - 9} cy={p.y + 9} r={3.5} fill={txt} />}
        <text x={p.x + S / 2} y={p.y < Y2 ? p.y - 9 : p.y + S + 15} textAnchor="middle" fontSize="11.5" fill={isActive ? 'var(--ink)' : 'var(--ink-2)'} fontWeight={isActive ? 600 : 400} fontFamily="var(--f-ui)">
          {info.short}
        </text>
      </g>
    );
  };

  const arrow = 'url(#gf-arrow)';
  const hLink = (a: number, b: number) => {
    const pa = POS[a];
    const pb = POS[b];
    const x1 = pa.x + S;
    const x2 = pb.x;
    const y = pa.y + S / 2;
    const xm = (x1 + x2) / 2;
    return (
      <g key={`${a}-${b}`}>
        <line x1={x1} y1={y} x2={x2 - 2} y2={y} stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
        <line x1={xm} y1={y - 7} x2={xm} y2={y + 7} stroke="var(--ink)" strokeWidth={2.5} />
        <text x={xm} y={y - 11} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">{COND[`${a}-${b}`]}</text>
      </g>
    );
  };

  const p5 = POS[5];
  const p7 = POS[7];
  const p3 = POS[3];
  const p6 = POS[6];
  const p8 = POS[8];
  const p0 = POS[0];

  return (
    <svg className="grafcet" viewBox={`0 0 ${W} 228`} role="img" aria-label={`Sekwencja uzbrajania, etap aktywny: ${active ?? 'brak danych'}`}>
      <defs>
        <marker id="gf-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L8 4L0 8Z" fill="var(--ink-2)" />
        </marker>
      </defs>
      {[0, 1, 2, 3, 4, 5].map((i) => hLink(i, i + 1))}
      {/* 5 → 7 (F ≥ 20 N, pierwsza próba) */}
      <path d={`M${p5.x + 12} ${p5.y + S} V${p7.y + S / 2} H${p7.x + S + 2}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
      <line x1={p5.x + 5} x2={p5.x + 19} y1={p5.y + S + 26} y2={p5.y + S + 26} stroke="var(--ink)" strokeWidth={2.5} />
      <text x={p5.x + 1} y={p5.y + S + 30} textAnchor="end" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">F ≥ 20 N, n = 1</text>
      {/* 7 → 3 (S1) */}
      <path d={`M${p7.x} ${p7.y + S / 2} H${p3.x + S / 2} V${p3.y + S + 4}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
      <line x1={p3.x + S / 2 - 7} x2={p3.x + S / 2 + 7} y1={p7.y + 6} y2={p7.y + 6} stroke="var(--ink)" strokeWidth={2.5} />
      <text x={p3.x + S / 2 + 10} y={p7.y + 10} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">S1</text>
      {/* 5 → 8 (n = 2) i 6 → 8 (DISCHARGE) */}
      <path d={`M${p5.x + S - 12} ${p5.y + S} V${p8.y + 10} H${p8.x - 2}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
      <text x={p5.x + S - 6} y={p8.y + 4} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">n = 2</text>
      <line x1={p6.x + S / 2} y1={p6.y + S} x2={p6.x + S / 2} y2={p8.y - 2} stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
      <text x={p6.x + S / 2 + 6} y={p8.y - 18} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">DISCHARGE</text>
      {/* 8 → 0 (S1) */}
      <path d={`M${p8.x + S} ${p8.y + S / 2} H${p8.x + S + 22} V${p8.y + S + 30} H${p0.x + S / 2} V${p0.y + S + 4}`} fill="none" stroke="var(--ink-2)" strokeWidth={1.3} markerEnd={arrow} />
      <text x={p0.x + S / 2 + 8} y={p8.y + S + 25} fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--f-ui)">S1 (po rozładowaniu)</text>
      {STAGES.map((s) => step(s.id))}
    </svg>
  );
}
