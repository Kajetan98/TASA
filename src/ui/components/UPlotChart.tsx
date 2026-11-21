import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

/**
 * Wrapper uPlot. `build` tworzy opcje (wywoływany przy zmianie motywu lub `deps`),
 * `getData` zwraca dane, a `version` sygnalizuje ich zmianę; odświeżanie w requestAnimationFrame.
 */
export function UPlotChart({
  build,
  getData,
  version,
  height,
  deps = [],
  ariaLabel,
}: {
  build: (width: number, height: number) => uPlot.Options;
  getData: () => uPlot.AlignedData;
  version: () => number;
  height: number;
  deps?: unknown[];
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const getDataRef = useRef(getData);
  const versionRef = useRef(version);
  getDataRef.current = getData;
  versionRef.current = version;

  useEffect(() => {
    const el = ref.current!;
    const width = Math.max(200, el.clientWidth);
    const p = new uPlot(build(width, height), getDataRef.current(), el);
    plot.current = p;
    let lastV = versionRef.current();
    let raf = 0;
    const loop = () => {
      const v = versionRef.current();
      if (v !== lastV) {
        lastV = v;
        p.setData(getDataRef.current(), true);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => {
      const w = Math.max(200, el.clientWidth);
      if (Math.abs(w - p.width) > 1) p.setSize({ width: w, height });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      p.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, ...deps]);

  return <div ref={ref} className="chart" role="img" aria-label={ariaLabel} />;
}

/** Kolory z tokenów CSS (odczyt przy budowie wykresu, po zmianie motywu wykres jest tworzony od nowa). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

export function axisStyle(): Partial<uPlot.Axis> {
  return {
    stroke: cssVar('--ink-2'),
    grid: { stroke: cssVar('--rule'), width: 1 },
    ticks: { stroke: cssVar('--rule'), width: 1, size: 4 },
    font: '12px Barlow, system-ui, sans-serif',
    labelFont: '600 12px Barlow, system-ui, sans-serif',
  };
}
