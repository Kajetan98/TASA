import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { TrialRecord } from './trials';

/** Przechowywanie lokalne rekordów prób w IndexedDB (bez serwera). */

interface TasaDb extends DBSchema {
  trials: {
    key: string;
    value: TrialRecord;
    indexes: { byDate: string };
  };
}

let dbp: Promise<IDBPDatabase<TasaDb>> | null = null;

function db(): Promise<IDBPDatabase<TasaDb>> {
  if (!dbp) {
    dbp = openDB<TasaDb>('tasa-monitor', 1, {
      upgrade(d) {
        const s = d.createObjectStore('trials', { keyPath: 'id' });
        s.createIndex('byDate', 'createdAt');
      },
    });
  }
  return dbp;
}

export async function saveTrial(t: TrialRecord): Promise<TrialRecord> {
  const d = await db();
  let id = t.id;
  let k = 2;
  while (await d.get('trials', id)) id = `${t.id}-${k++}`;
  const rec = { ...t, id };
  await d.put('trials', rec);
  return rec;
}

export async function updateTrial(t: TrialRecord): Promise<void> {
  await (await db()).put('trials', t);
}

export async function listTrials(): Promise<TrialRecord[]> {
  const all = await (await db()).getAllFromIndex('trials', 'byDate');
  return all.reverse();
}

export async function deleteTrial(id: string): Promise<void> {
  await (await db()).delete('trials', id);
}
