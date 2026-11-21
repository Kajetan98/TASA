import { describe, expect, it } from 'vitest';
import { deriveAnchorState, tiltFromAcc } from '../src/domain/anchorState';
import { IncrementalLineFit, fitLine, mean, range, sampleStd } from '../src/domain/stats';
import type { TelemetryFrame } from '../src/protocol/anchorFrames';
import { CockAnalyzer, residualFrom } from '../src/domain/stationAnalysis';

const tel = (hs: number, he: number, disk: 0 | 1, pin: 0 | 1 | null = null): TelemetryFrame => ({
  type: 'telemetry', seq: 1, t_us: 1000, acc: [0, 0, 1], tilt: null, hs, he, disk, pin,
});

describe('statystyki', () => {
  it('średnia, odchylenie z próby, rozstęp', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sampleStd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(range([3, -1, 7])).toBe(8);
    expect(sampleStd([5])).toBeNaN();
  });

  it('prosta MNK odtwarza nachylenie i wyraz wolny', () => {
    const xs = Array.from({ length: 50 }, (_, i) => 190 + i * 0.8);
    const ys = xs.map((x) => 25.6 * (x - 190) + 277);
    const f = fitLine(xs, ys)!;
    expect(f.slope).toBeCloseTo(25.6, 9);
    expect(f.intercept).toBeCloseTo(277 - 25.6 * 190, 6);
    expect(f.r2).toBeCloseTo(1, 9);
  });

  it('wersja przyrostowa zgadza się z rozwiązaniem w postaci zamkniętej przy szumie', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    let s = 3;
    for (let i = 0; i < 400; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      const x = 1e5 + i * 0.05;
      xs.push(x);
      ys.push(21.33 * x + 7 + ((s / 2147483648) - 0.5) * 2);
    }
    // rozwiązanie referencyjne
    const n = xs.length;
    const mx = mean(xs);
    const my = mean(ys);
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
    }
    const ref = sxy / sxx;
    const inc = new IncrementalLineFit();
    xs.forEach((x, i) => inc.add(x, ys[i]));
    expect(inc.result()!.slope).toBeCloseTo(ref, 8);
  });

  it('za mało punktów daje null', () => {
    expect(fitLine([1], [2])).toBeNull();
    expect(fitLine([1, 1], [2, 3])).toBeNull();
  });
});

describe('stan kotwicy', () => {
  it('UZBROJONA Z ZAWLECZKĄ, UZBROJONA, zawleczka nieznana', () => {
    expect(deriveAnchorState(tel(63, 0, 0, 1), 10).label).toBe('UZBROJONA Z ZAWLECZKĄ');
    expect(deriveAnchorState(tel(63, 0, 0, 0), 10).label).toBe('UZBROJONA');
    const u = deriveAnchorState(tel(63, 0, 0, null), 10);
    expect(u.label).toBe('UZBROJONA');
    expect(u.reason).toMatch(/zawleczki nieznany/);
  });

  it('ROZBROJONA, WYZWOLONA, NIEPEŁNE WYZWOLENIE', () => {
    expect(deriveAnchorState(tel(0, 63, 0), 10).label).toBe('ROZBROJONA');
    expect(deriveAnchorState(tel(0, 63, 1), 10).label).toBe('WYZWOLONA');
    const p = deriveAnchorState(tel(0b000100, 0b111011, 1), 10);
    expect(p.label).toBe('NIEPEŁNE WYZWOLENIE');
    expect(p.notAtEnd).toEqual([3]);
  });

  it('NIEOKREŚLONY przy błędzie czujnika i położeniach mieszanych', () => {
    expect(deriveAnchorState(tel(1, 1, 0), 10).code).toBe('UNDETERMINED');
    expect(deriveAnchorState(tel(0b000111, 0b111000, 0), 10).code).toBe('UNDETERMINED');
  });

  it('BRAK DANYCH i oznaczenie nieaktualności', () => {
    expect(deriveAnchorState(null, null).label).toBe('BRAK DANYCH');
    expect(deriveAnchorState(tel(63, 0, 0, 1), 900).stale).toBe(true);
    expect(deriveAnchorState(tel(63, 0, 0, 1), 100).stale).toBe(false);
  });

  it('przechył z akcelerometru', () => {
    expect(tiltFromAcc([0, 0, 1])).toBeCloseTo(0, 6);
    const r = (28.8 * Math.PI) / 180;
    expect(tiltFromAcc([Math.sin(r), 0, Math.cos(r)])).toBeCloseTo(28.8, 6);
    expect(tiltFromAcc([0, 0, 0.01])).toBeNull();
  });
});

describe('analiza naciągu', () => {
  const rows = (slope: number, x0: number, n: number, dt = 0.02, v = 3) =>
    Array.from({ length: n }, (_, i) => {
      const x = x0 + v * dt * i;
      return { t: 100 + dt * i, stage: 4, x, F: 277 + slope * (x - x0) };
    });

  it('wyznacza nachylenie, siłę szczytową, skok i odchyłkę', () => {
    const a = new CockAnalyzer();
    a.add({ t: 99, stage: 3, x: 189, F: 0 });
    for (const r of rows(21.33, 190, 723)) a.add(r);
    a.add({ t: 120, stage: 0, x: 233, F: 1200 });
    const at = a.attempts[0];
    expect(at.fit!.slope).toBeCloseTo(21.33, 6);
    expect(at.slopeDevPct!).toBeCloseTo((21.33 / 25.6 - 1) * 100, 4);
    expect(at.slopeOk).toBe(false);
    expect(at.stroke!).toBeCloseTo(43.32, 2);
    expect(at.peakF!).toBeCloseTo(277 + 21.33 * 43.32, 1);
  });

  it('oczekiwane nachylenie w ponowionej próbie wynika z siły resztkowej', () => {
    const a = new CockAnalyzer();
    for (const r of rows(25.6, 190, 723)) a.add(r);
    for (let i = 0; i < 20; i++) a.add({ t: 130 + i * 0.02, stage: 5, x: 228.9, F: 211 + (i % 2 ? 0.5 : -0.5) });
    a.add({ t: 131, stage: 7, x: 228, F: 200 });
    expect(a.attempts[0].residualF!).toBeCloseTo(211, 0);
    expect(a.attempts[0].residualOk).toBe(false);
    for (const r of rows(4.27, 190, 723)) a.add({ ...r, t: r.t + 100 });
    a.add({ t: 300, stage: 5, x: 228, F: 210 });
    expect(a.attempts[1].expectedSlope).toBeCloseTo(25.6 / 6, 6);
    expect(a.attempts[1].slopeOk).toBe(true);
  });

  it('siła resztkowa z wierszy po zatrzymaniu płyty', () => {
    const r = [
      { t: 0, stage: 5, x: 233, F: 1300 },
      { t: 0.5, stage: 5, x: 230, F: 600 },
      ...Array.from({ length: 12 }, (_, i) => ({ t: 1 + i * 0.02, stage: 5, x: 228.85, F: i % 2 ? 0.4 : -0.6 })),
    ];
    expect(Math.abs(residualFrom(r)!)).toBeLessThan(1);
  });
});
