import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SwingRecord } from '../types';

interface GolfDB extends DBSchema {
  swings: { key: string; value: SwingRecord; indexes: { 'by-date': number } };
  clips: { key: string; value: Blob };
}

/** A unique id. crypto.randomUUID only exists in secure contexts (https or localhost), so over plain http on a LAN address it is missing. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

let dbPromise: Promise<IDBPDatabase<GolfDB>> | null = null;

function db(): Promise<IDBPDatabase<GolfDB>> {
  dbPromise ??= openDB<GolfDB>('golf-swing-analyzer', 1, {
    upgrade(database) {
      const swings = database.createObjectStore('swings', { keyPath: 'id' });
      swings.createIndex('by-date', 'createdAt');
      database.createObjectStore('clips');
    },
  });
  return dbPromise;
}

export async function saveSwing(record: SwingRecord, clip?: Blob): Promise<void> {
  const d = await db();
  const tx = d.transaction(['swings', 'clips'], 'readwrite');
  await tx.objectStore('swings').put(record);
  if (clip) await tx.objectStore('clips').put(clip, record.id);
  await tx.done;
}

/** All saved swings, newest first. */
export async function listSwings(): Promise<SwingRecord[]> {
  const all = await (await db()).getAllFromIndex('swings', 'by-date');
  return all.reverse();
}

export async function getClip(id: string): Promise<Blob | undefined> {
  return (await db()).get('clips', id);
}

export async function deleteSwing(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['swings', 'clips'], 'readwrite');
  await tx.objectStore('swings').delete(id);
  await tx.objectStore('clips').delete(id);
  await tx.done;
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(['swings', 'clips'], 'readwrite');
  await tx.objectStore('swings').clear();
  await tx.objectStore('clips').clear();
  await tx.done;
}
