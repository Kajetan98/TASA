import { describe, expect, it } from 'vitest';
import { cell, formatNumber, summaryCsv, trialCsv } from '../src/export/csv';
import { SUMMARY_COLUMNS } from '../src/export/summaryColumns';
import type { TrialRecord } from '../src/store/trials';

const rec: TrialRecord = {
  id: 'Z-20261121-120000',
  kind: 'zrzut',
  createdAt: '2026-11-21T12:00:00.000Z',
  source: 'symulacja',
  scenario: 'h = 0,2 m; rozrzut 2 ms',
  params: { badanie: 'B3', wysokoscM: 0.2, uwagi: 'linia "a"\nlinia b' },
  summary: { spreadMs: 2, stdMs: 0.792, delayMs: 7.2, released: 6 },
};

describe('eksport CSV', () => {
  it('format PL: przecinek dziesiętny, średnik, cudzysłowy przy znakach specjalnych', () => {
    expect(formatNumber(25.594, 'pl')).toBe('25,594');
    expect(formatNumber(25.594, 'intl')).toBe('25.594');
    expect(formatNumber(NaN, 'pl')).toBe('');
    expect(cell('a;b', 'pl')).toBe('"a;b"');
    expect(cell('a;b', 'intl')).toBe('a;b');
    expect(cell('x "y"', 'pl')).toBe('"x ""y"""');
    expect(cell(null, 'pl')).toBe('');
    expect(cell(true, 'pl')).toBe('tak');
  });

  it('podsumowanie: BOM, nagłówek z kolumn karty, jeden wiersz na próbę', () => {
    const csv = summaryCsv([rec, rec], 'pl');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0].split(';')).toHaveLength(SUMMARY_COLUMNS.length);
    // uwagi z nową linią są w cudzysłowie, więc fizycznych linii jest więcej, ale każdy rekord zaczyna się od Id
    expect(lines.filter((l) => l.startsWith('Z-20261121-120000'))).toHaveLength(2);
    expect(csv).toContain(';7,2;2;;0,792;6;');
  });

  it('próba: sekcje metadanych i wyników', () => {
    const csv = trialCsv(rec, 'pl');
    expect(csv).toContain('Próba;Z-20261121-120000');
    expect(csv).toContain('Rozrzut zwolnienia max-min [ms];2');
    expect(csv).toContain('Opóźnienie kontakt-tarcza [ms];7,2');
  });
});
