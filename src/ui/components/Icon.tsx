import type { ReactElement, ReactNode } from 'react';
/** Ikony liniowe 16×16; kolor dziedziczony (currentColor). */

export type IconName =
  | 'ok' | 'warn' | 'crit' | 'info' | 'sun' | 'moon' | 'auto' | 'close'
  | 'download' | 'link' | 'unlink' | 'play' | 'lock' | 'dot';

const P: Record<IconName, ReactElement> = {
  ok: <path d="M3 8.5l3 3 7-7" />,
  warn: (
    <>
      <path d="M8 2.2L14.5 13.5H1.5Z" />
      <path d="M8 6.5v3.2M8 11.6v.1" />
    </>
  ),
  crit: (
    <>
      <path d="M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3l-3.8-3.8V5.3Z" />
      <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.3" />
      <path d="M8 7.2v4M8 4.8v.1" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3" />
    </>
  ),
  moon: <path d="M13.2 10.2A5.6 5.6 0 0 1 5.8 2.8a5.6 5.6 0 1 0 7.4 7.4Z" />,
  auto: (
    <>
      <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1" />
      <path d="M5.5 14h5M8 11.2V14" />
    </>
  ),
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  download: <path d="M8 2v8.5M4.5 7L8 10.5 11.5 7M2.5 13.5h11" />,
  link: <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />,
  unlink: <path d="M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1M2 2l12 12" />,
  play: <path d="M4.5 2.8v10.4L13 8Z" />,
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" />
    </>
  ),
  dot: <circle cx="8" cy="8" r="3.5" />,
};

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ flex: 'none' }}
    >
      {P[name]}
    </svg>
  );
}

export type Tone = 'good' | 'warn' | 'crit' | 'muted' | 'info';

export const toneIcon: Record<Tone, IconName> = { good: 'ok', warn: 'warn', crit: 'crit', muted: 'dot', info: 'info' };

/** Stan z ikoną i etykietą: kolor nigdy nie występuje bez tekstu. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="status" data-tone={tone}>
      <Icon name={toneIcon[tone]} />
      {children}
    </span>
  );
}
