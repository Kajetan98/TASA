import type { IoKey } from '../../protocol/stationFrames';

/** Lampka wejścia/wyjścia sterownika. Brak danych jest pokazywany jawnie, nie jako stan 0. */

export interface IoMeta {
  key: IoKey;
  kind: 'in' | 'out';
  desc: string;
  /** Ton dla stanu aktywnego/nieaktywnego, gdy sygnał dotyczy bezpieczeństwa. */
  toneOn?: 'good' | 'crit';
  toneOff?: 'good' | 'crit';
}

export const IO_META: IoMeta[] = [
  { key: 'S1', kind: 'in', desc: 'płyta w położeniu dolnym' },
  { key: 'S2', kind: 'in', desc: 'płyta w położeniu górnym' },
  { key: 'S3', kind: 'in', desc: 'kotwica w gnieździe' },
  { key: 'S4', kind: 'in', desc: 'szczęki zaciśnięte' },
  { key: 'S5', kind: 'in', desc: 'zawleczka wsunięta' },
  { key: 'S6', kind: 'in', desc: 'osłona zamknięta', toneOn: 'good', toneOff: 'crit' },
  { key: 'STOP', kind: 'in', desc: 'wyłącznik zatrzymania', toneOn: 'crit' },
  { key: 'START', kind: 'in', desc: 'przycisk panelu' },
  { key: 'M1', kind: 'out', desc: 'napęd płyty' },
  { key: 'Y1', kind: 'out', desc: 'siłownik szczęk' },
  { key: 'Y2', kind: 'out', desc: 'siłownik zawleczki' },
  { key: 'Y3', kind: 'out', desc: 'siłownik wyzwalania' },
];

export function Lamp({ meta, value }: { meta: IoMeta; value: boolean | undefined }) {
  const v = value === undefined ? 'none' : value ? '1' : '0';
  const tone = value === undefined ? undefined : value ? meta.toneOn : meta.toneOff;
  return (
    <div className="lamp" data-v={v} data-kind={meta.kind} data-tone={tone}>
      <span className="dot" aria-hidden="true" />
      <span className="name">{meta.key}</span>
      <span className="desc">{meta.desc}</span>
      <span className="v">{v === 'none' ? 'brak' : v}</span>
    </div>
  );
}
