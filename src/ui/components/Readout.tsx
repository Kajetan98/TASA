import type { ReactNode } from 'react';

export function Readout({
  label,
  value,
  unit,
  sub,
  tone,
  stale,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'crit';
  stale?: boolean;
}) {
  return (
    <div className="readout" data-tone={tone} data-stale={stale ? 'true' : undefined}>
      <span className="lbl">{label}</span>
      <span className="val">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}
