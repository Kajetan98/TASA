import { describe, expect, it } from 'vitest';
import { LineSplitter } from '../src/protocol/lineSplitter';
import { anchorCommand, parseAnchorLine } from '../src/protocol/anchorFrames';
import { detectTimeUnit, parseStationLine } from '../src/protocol/stationFrames';

describe('LineSplitter', () => {
  it('składa linie z fragmentów i rozdziela kilka linii w jednym fragmencie', () => {
    const s = new LineSplitter();
    expect(s.push('{"a":1')).toEqual([]);
    expect(s.push('}\r\n{"b":2}\n{"c"')).toEqual(['{"a":1}', '{"b":2}']);
    expect(s.push(':3}\n\n')).toEqual(['{"c":3}']);
  });

  it('odrzuca linię dłuższą niż limit', () => {
    const s = new LineSplitter(10);
    s.push('x'.repeat(20));
    expect(s.overflows).toBe(1);
    expect(s.push('ok\n')).toEqual(['ok']);
  });
});

describe('parser ramek modułu kotwicy', () => {
  it('parsuje telemetry z polami opcjonalnymi', () => {
    const r = parseAnchorLine('{"type":"telemetry","seq":5,"t_us":1000,"acc":[0,0.1,0.99],"hs":63,"he":0,"disk":0,"pin":1}');
    expect(r.ok).toBe(true);
    if (r.ok && r.frame.type === 'telemetry') {
      expect(r.frame.hs).toBe(63);
      expect(r.frame.pin).toBe(1);
      expect(r.frame.tilt).toBeNull();
      expect(r.frame.acc).toEqual([0, 0.1, 0.99]);
    }
  });

  it('telemetry bez pola pin daje pin = null', () => {
    const r = parseAnchorLine('{"type":"telemetry","t_us":1,"hs":0,"he":63,"disk":1}');
    expect(r.ok && r.frame.type === 'telemetry' && r.frame.pin).toBeNull();
  });

  it('parsuje zdarzenia hall, disk, imu_peak', () => {
    const h = parseAnchorLine('{"type":"event","seq":1,"t_us":2000,"src":"hall","ch":3,"pos":"start","val":0}');
    expect(h.ok && h.frame.type === 'event' && h.frame.ch).toBe(3);
    const d = parseAnchorLine('{"type":"event","t_us":2500,"src":"disk","val":1}');
    expect(d.ok && d.frame.type === 'event' && d.frame.src).toBe('disk');
    const p = parseAnchorLine('{"type":"event","t_us":2400,"src":"imu_peak","val":38.5}');
    expect(p.ok && p.frame.type === 'event' && p.frame.val).toBe(38.5);
  });

  it('parsuje status, window, hello, ack', () => {
    expect(parseAnchorLine('{"type":"status","t_us":1,"vbat":3.9,"rssi":-60}').ok).toBe(true);
    const w = parseAnchorLine('{"type":"window","t_us":9,"id":1,"ch":"az","t0_us":100,"dt_us":100,"n":4,"i":2,"v":[1,2]}');
    expect(w.ok).toBe(true);
    expect(parseAnchorLine('{"type":"hello","t_us":0,"dev":"X","proto":1}').ok).toBe(true);
    expect(parseAnchorLine('{"type":"ack","t_us":0,"cmd":"rearm","ok":true}').ok).toBe(true);
  });

  it('odrzuca ramki niepoprawne', () => {
    const bad = [
      'nie json',
      '[1,2]',
      '{"type":"telemetry","hs":63,"he":0,"disk":0}', // brak t_us
      '{"type":"telemetry","t_us":1.5,"hs":63,"he":0,"disk":0}', // t_us niecałkowite
      '{"type":"telemetry","t_us":1,"hs":64,"he":0,"disk":0}', // maska poza zakresem
      '{"type":"telemetry","t_us":1,"hs":1,"he":0,"disk":2}',
      '{"type":"telemetry","t_us":1,"hs":1,"he":0,"disk":0,"acc":[1,2]}',
      '{"type":"event","t_us":1,"src":"hall","ch":7,"pos":"start","val":0}',
      '{"type":"event","t_us":1,"src":"hall","ch":1,"pos":"mid","val":0}',
      '{"type":"event","t_us":1,"src":"laser","val":0}',
      '{"type":"window","t_us":1,"id":1,"ch":"az","t0_us":0,"dt_us":100,"n":2,"i":1,"v":[1,2]}',
      '{"type":"xyz","t_us":1}',
    ];
    for (const b of bad) expect(parseAnchorLine(b).ok, b).toBe(false);
  });

  it('tworzy polecenia JSON', () => {
    expect(anchorCommand('rearm')).toBe('{"cmd":"rearm"}');
    expect(anchorCommand('ping', 3)).toBe('{"cmd":"ping","id":3}');
  });
});

describe('parser wierszy stacji', () => {
  it('przyjmuje istniejący format t, stan, x, F', () => {
    expect(parseStationLine('12340, 4, 201.35, 512.7')).toEqual({ kind: 'log', t: 12340, stage: 4, x: 201.35, F: 512.7 });
    expect(parseStationLine('12.34,3,190.00,-0.4')).toEqual({ kind: 'log', t: 12.34, stage: 3, x: 190, F: -0.4 });
    expect(parseStationLine('100;0;0.00;0.1')).toMatchObject({ kind: 'log', stage: 0 });
    expect(parseStationLine('100\t0\t0.00\t0.1')).toMatchObject({ kind: 'log', stage: 0 });
  });

  it('F = nan lub puste pole oznacza brak próbki', () => {
    expect(parseStationLine('100, 4, 210.0, nan')).toMatchObject({ kind: 'log', F: null });
    expect(parseStationLine('100, 4, 210.0, ')).toMatchObject({ kind: 'log', F: null });
  });

  it('pomija nagłówek i nie myli innych wierszy z LOG', () => {
    expect(parseStationLine('t, stan, x, F')).toEqual({ kind: 'header' });
    expect(parseStationLine('100, 4.5, 1, 2').kind).not.toBe('log'); // etap niecałkowity
    expect(parseStationLine('Station ready').kind).toBe('text');
  });

  it('rozpoznaje wiersze IO i STATUS', () => {
    const io = parseStationLine('IO S1=1 S2=0 S3=1 S4=1 S5=1 S6=1 STOP=0 START=0 M1=0 Y1=1 Y2=1 Y3=0');
    expect(io).toMatchObject({ kind: 'io', isStatus: false });
    if (io.kind === 'io') {
      expect(io.io.S1).toBe(true);
      expect(io.io.Y3).toBe(false);
    }
    const st = parseStationLine('STATUS stan=6 S1=1 S6=1 alarm=NONE');
    expect(st).toMatchObject({ kind: 'io', stage: 6, alarm: 'NONE', isStatus: true });
  });

  it('rozpoznaje kody alarmów w dowolnym wierszu i kasowanie', () => {
    expect(parseStationLine('ALARM SPRING_SLOPE slope=21.31')).toMatchObject({ kind: 'alarm', codes: ['SPRING_SLOPE'] });
    expect(parseStationLine('FAULT: OVERLOAD F=1702')).toMatchObject({ kind: 'alarm', codes: ['OVERLOAD'] });
    expect(parseStationLine('ALARM XYZ_NEW')).toMatchObject({ kind: 'alarm', codes: ['XYZ_NEW'] });
    expect(parseStationLine('ALARM CLEAR')).toMatchObject({ kind: 'alarmClear' });
    expect(parseStationLine('ALARM NONE')).toMatchObject({ kind: 'alarmClear' });
  });

  it('rozpoznaje potwierdzenia', () => {
    expect(parseStationLine('OK START')).toMatchObject({ kind: 'ack', ok: true, command: 'START' });
    expect(parseStationLine('ERR START DOOR')).toMatchObject({ kind: 'ack', ok: false, command: 'START' });
  });

  it('wykrywa jednostkę czasu z odstępu wierszy', () => {
    expect(detectTimeUnit([1000, 1020, 1040, 1060])).toBe('ms');
    expect(detectTimeUnit([1.0, 1.02, 1.04, 1.06])).toBe('s');
    expect(detectTimeUnit([1])).toBeNull();
  });
});
