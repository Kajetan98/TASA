import { useEffect, useRef, useState } from 'react';

/**
 * Logo TASA_A jako żywy model pryzmatu tensegrity (widok z góry): dwa trójkąty cięgien
 * i trzy pręty. Najechanie skręca górny trójkąt o −12° (struktura ugina się jak przy kontakcie
 * z gruntem). Kliknięcie odtwarza wyzwolenie: skręt do −30°, przy którym pręty układają się
 * w gwiazdę sześcioramienną zgodną z kierunkami sześciu grotów, wystrzał grotów i powrót
 * z tłumionymi drganiami. Geometria w spoczynku odpowiada plikowi TASA_A.svg.
 */

const C = 128;
const R = 96;
const deg = Math.PI / 180;
const HOVER_TWIST = -12;
const RELEASE_TWIST = -30;
const RELEASE_HOLD_MS = 200;

function pt(angleDeg: number): [number, number] {
  return [C + R * Math.cos(angleDeg * deg), C + R * Math.sin(angleDeg * deg)];
}

const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const f = (n: number) => n.toFixed(2);
const seg = (a: [number, number], b: [number, number]) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;

function Geometry({ twist, halo }: { twist: number; halo: string }) {
  // Trójkąt dolny: −90°, 30°, 150°; górny: 0°, 120°, 240° (+ skręt).
  const A = [-90, 30, 150].map(pt);
  const Bang = (a: number) => a + 210 + twist;
  const struts = [-90, 30, 150].map((a, i) => ({ a: A[i], b: pt(Bang(a)) }));
  const top = [0, 120, 240].map((a) => pt(a + twist));
  const tri = (ps: [number, number][]) => ps.map((p) => `${f(p[0])} ${f(p[1])}`).join(' ');
  const order = [0, 2, 1];
  return (
    <>
      <polygon points={tri(A)} fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="round" />
      <polygon points={tri(top)} fill="none" stroke="currentColor" strokeWidth={5} strokeLinejoin="round" />
      {struts.map((s, i) => (
        <path key={`h2-${i}`} d={seg(lerp(s.a, s.b, 0.5), s.b)} stroke="currentColor" strokeWidth={18} strokeLinecap="round" />
      ))}
      {order.map((i) => {
        const s = struts[i];
        return (
          <g key={`s-${i}`}>
            <path d={seg(lerp(s.a, s.b, 0.15), lerp(s.a, s.b, 0.5))} stroke={halo} strokeWidth={34} />
            <path d={seg(s.a, lerp(s.a, s.b, 0.5))} stroke="currentColor" strokeWidth={18} strokeLinecap="round" />
            <path d={seg(lerp(s.a, s.b, 0.495), lerp(s.a, s.b, 0.525))} stroke="currentColor" strokeWidth={18} />
          </g>
        );
      })}
    </>
  );
}

export function TasaMark({ size = 44, halo = 'var(--sheet)', onActivate }: { size?: number; halo?: string; onActivate?: () => void }) {
  const [twist, setTwist] = useState(0);
  const [fired, setFired] = useState(0);
  const target = useRef(0);
  const state = useRef({ x: 0, v: 0 });
  const raf = useRef<number | null>(null);
  const reduced = useRef(false);
  const hovering = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    reduced.current = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const run = () => {
    if (raf.current !== null) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const s = state.current;
      // tłumiony oscylator: sztywność i tłumienie dobrane do ok. 2 wahnięć
      const k = 170;
      const c = 9;
      const a = -k * (s.x - target.current) - c * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      setTwist(s.x);
      if (Math.abs(s.x - target.current) < 0.05 && Math.abs(s.v) < 0.05) {
        s.x = target.current;
        s.v = 0;
        setTwist(s.x);
        raf.current = null;
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  const setTarget = (t: number) => {
    target.current = t;
    if (reduced.current) {
      state.current = { x: t, v: 0 };
      setTwist(t);
      return;
    }
    run();
  };

  const release = () => {
    setFired((n) => n + 1);
    onActivate?.();
    if (reduced.current) return;
    // wychylenie do gwiazdy sześcioramiennej, potem powrót do skrętu zależnego od kursora
    target.current = RELEASE_TWIST;
    state.current.v -= 120;
    run();
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      target.current = hovering.current ? HOVER_TWIST : 0;
      run();
    }, RELEASE_HOLD_MS);
  };

  const tines = Array.from({ length: 6 }, (_, i) => {
    const a = (-90 + i * 60) * deg;
    const r1 = 104;
    const r2 = 146;
    return { x1: C + r1 * Math.cos(a), y1: C + r1 * Math.sin(a), x2: C + r2 * Math.cos(a), y2: C + r2 * Math.sin(a) };
  });

  return (
    <button
      type="button"
      className="tasa-mark"
      style={{ width: size, height: size }}
      aria-label="TASA: Tensegrity Automatic System for Anchoring. Kliknij, aby odtworzyć wyzwolenie."
      title="Tensegrity Automatic System for Anchoring"
      data-fired={fired > 0 ? 'true' : 'false'}
      onPointerEnter={() => { hovering.current = true; setTarget(HOVER_TWIST); }}
      onPointerLeave={() => { hovering.current = false; setTarget(0); }}
      onFocus={() => { hovering.current = true; setTarget(HOVER_TWIST); }}
      onBlur={() => { hovering.current = false; setTarget(0); }}
      onClick={release}
    >
      <svg viewBox="0 0 256 256" aria-hidden="true">
        <g key={fired}>
          {tines.map((t, i) => (
            <line key={i} className="tine" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeDasharray="42 42" />
          ))}
        </g>
        <Geometry twist={twist} halo={halo} />
      </svg>
    </button>
  );
}
