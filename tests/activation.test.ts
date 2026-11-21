import { describe, expect, it } from 'vitest';
import { ActivationRecorder, computeActivation, WindowAssembler } from '../src/domain/activation';
import { parseAnchorLine } from '../src/protocol/anchorFrames';
import type { AnchorFrame, EventFrame } from '../src/protocol/anchorFrames';
import { AnchorSim } from '../src/sim/anchorSim';
import { deriveAnchorState } from '../src/domain/anchorState';

const ev = (t_us: number, src: EventFrame['src'], val: number, ch: number | null = null, pos: 'start' | 'end' | null = null): EventFrame => ({
  type: 'event', seq: null, t_us, src, ch, pos, val,
});

describe('obliczenia zdarzenia', () => {
  it('rozrzut, odchylenie, czasy skoku i prędkość ze znaczników µC', () => {
    const disk = 1_000_000;
    const rel = [300, 1100, 700, 2300, 500, 900].map((d) => disk + d);
    const end = rel.map((r, i) => r + 5000 + i * 100);
    const events: EventFrame[] = [ev(disk - 7200, 'imu_peak', 41), ev(disk, 'disk', 1)];
    rel.forEach((r, i) => events.push(ev(r, 'hall', 0, i + 1, 'start')));
    end.forEach((e, i) => events.push(ev(e, 'hall', 1, i + 1, 'end')));
    // kolejność odbioru nie ma znaczenia
    events.reverse();
    const r = computeActivation(disk, 'event', events, [], []);
    expect(r.contactSource).toBe('imu_peak');
    expect(r.delayContactToDiskMs).toBeCloseTo(7.2, 9);
    expect(r.releaseSpreadMs).toBeCloseTo(2.0, 9);
    const relMs = rel.map((x) => x / 1000);
    const m = relMs.reduce((a, b) => a + b) / 6;
    const sd = Math.sqrt(relMs.reduce((a, b) => a + (b - m) ** 2, 0) / 5);
    expect(r.releaseStdMs!).toBeCloseTo(sd, 9);
    expect(r.pushers[0].strokeMs).toBeCloseTo(5.0, 9);
    expect(r.pushers[5].strokeMs).toBeCloseTo(5.5, 9);
    expect(r.pushers[0].speedMS).toBeCloseTo(50 / 5.0, 9);
    expect(r.notReachedEnd).toEqual([]);
  });

  it('popychacz bez zbocza KONIEC jest oznaczony, a rozrzut liczony z pozostałych', () => {
    const disk = 5_000_000;
    const events: EventFrame[] = [ev(disk, 'disk', 1)];
    [100, 400, 900, 1200, 1500].forEach((d, i) => {
      events.push(ev(disk + d, 'hall', 0, i + 1, 'start'));
      events.push(ev(disk + d + 5400, 'hall', 1, i + 1, 'end'));
    });
    const r = computeActivation(disk, 'event', events, [], []);
    expect(r.releasedCount).toBe(5);
    expect(r.releaseSpreadMs).toBeCloseTo(1.4, 9);
    expect(r.notReachedEnd).toEqual([6]);
    expect(r.pushers[5].leftStart).toBe(false);
  });

  it('składa okno z porcji w dowolnej kolejności', () => {
    const a = new WindowAssembler();
    const base = { type: 'window' as const, seq: null, t_us: 0, id: 1, ch: 'az', t0_us: 0, dt_us: 100, n: 5 };
    a.add({ ...base, i: 3, v: [4, 5] });
    expect(a.all()[0].complete).toBe(false);
    a.add({ ...base, i: 0, v: [1, 2, 3] });
    expect(a.all()[0].complete).toBe(true);
    expect(a.all()[0].values).toEqual([1, 2, 3, 4, 5]);
  });
});

/** Uruchamia symulator modułu i przepuszcza linie przez parser oraz rejestrator, jak aplikacja. */
function runDrop(params: Parameters<AnchorSim['startDrop']>[0], seed = 11) {
  const sim = new AnchorSim({ seed });
  const rec = new ActivationRecorder();
  let now = 0;
  let captured = null as ReturnType<ActivationRecorder['push']>;
  let lastTel: AnchorFrame | null = null;
  const feed = (lines: string[]) => {
    for (const l of lines) {
      const p = parseAnchorLine(l);
      if (!p.ok) throw new Error(p.error + ': ' + l);
      if (p.frame.type === 'telemetry') lastTel = p.frame;
      const c = rec.push(p.frame, now);
      if (c) captured = c;
    }
  };
  feed(sim.hello());
  feed(sim.advance(500));
  const truth = sim.startDrop(params);
  for (let i = 0; i < 400 && !captured; i++) {
    now += 20;
    feed(sim.advance(20));
    const c = rec.tick(now);
    if (c) captured = c;
  }
  return { truth, captured: captured!, lastTel };
}

describe('symulator kotwicy → parser → rejestrator', () => {
  it('rozrzut zwolnienia zgadza się z wartością zadaną w symulatorze', () => {
    for (const spread of [0.8, 2.0, 3.7]) {
      const { truth, captured } = runDrop({ spreadMs: spread }, 100 + spread * 10);
      expect(captured).toBeTruthy();
      const r = captured.result;
      expect(r.releasedCount).toBe(6);
      expect(r.releaseSpreadMs!).toBeCloseTo(truth.spreadSetMs, 9);
      expect(Math.abs(r.releaseSpreadMs! - spread)).toBeLessThanOrEqual(0.0005);
      expect(r.notReachedEnd).toEqual([]);
    }
  });

  it('kontakt z okna 10 kHz i opóźnienie kontakt → tarcza 7,2 ms', () => {
    const { truth, captured } = runDrop({ contactToDiskMs: 7.2 });
    const r = captured.result;
    expect(captured.windowsComplete).toBe(true);
    expect(r.contactSource).toBe('window');
    expect(Math.abs(r.contact_us! - truth.contact_us)).toBeLessThanOrEqual(100);
    expect(Math.abs(r.delayContactToDiskMs! - 7.2)).toBeLessThanOrEqual(0.1);
    expect(r.disk_us).toBe(truth.disk_us);
    expect(r.triggerSource).toBe('event');
  });

  it('wariant z zablokowanym popychaczem: niepełne wyzwolenie i oznaczenie', () => {
    const { captured, lastTel } = runDrop({ blockedPusher: 4, spreadMs: 1.5 });
    const r = captured.result;
    expect(r.releasedCount).toBe(5);
    expect(r.notReachedEnd).toEqual([4]);
    expect(r.releaseSpreadMs!).toBeCloseTo(1.5, 9);
    const st = deriveAnchorState(lastTel as never, 10);
    expect(st.label).toBe('NIEPEŁNE WYZWOLENIE');
    expect(st.notAtEnd).toEqual([4]);
  });

  it('po pełnym zrzucie stan WYZWOLONA i przechył po przyziemieniu', () => {
    const { captured, lastTel } = runDrop({ tiltAfterDeg: 31 });
    expect(deriveAnchorState(lastTel as never, 10).label).toBe('WYZWOLONA');
    expect(captured.result.tiltAfterDeg!).toBeGreaterThan(28.8);
  });
});
