// Local cache + offline queue for DailyComfortEntry (data-model.md). Same offline-first pattern
// as dispatch-store.js: reads come from cache, writes try Supabase first and queue on failure.

import { get, getAll, put } from "./local-store.js";
import { enqueue, isOnline } from "./sync-queue.js";
import * as api from "../api-client.js";
import { todayKey } from "../models/comfort-entry.js";

const STORE = "comfortEntries";

function fromApiRow(row) {
  return { date: row.date, energyLevel: row.energy_level, statuses: row.statuses || [], updatedAt: row.updated_at };
}

export async function getEntry(date = todayKey()) {
  return get(STORE, date);
}

export async function getAllEntries() {
  const all = await getAll(STORE);
  return all.sort((a, b) => b.date.localeCompare(a.date));
}

async function saveLocally(entry) {
  const record = { ...entry, updatedAt: new Date().toISOString() };
  await put(STORE, record);
  return record;
}

export async function saveEntry(entry) {
  const record = await saveLocally(entry);

  if (isOnline()) {
    const { data, error } = await api.upsertComfortEntry({
      date: entry.date,
      energyLevel: entry.energyLevel,
      statuses: entry.statuses,
    });
    if (!error && data) {
      return saveLocally(fromApiRow(data));
    }
  }

  await enqueue({
    kind: "comfort",
    op: "upsert",
    payload: { date: entry.date, energyLevel: entry.energyLevel, statuses: entry.statuses },
  });
  return record;
}

// Passed to sync-queue.replayQueue({ comfort: comfortSyncHandler }).
export async function comfortSyncHandler(entry) {
  const { data, error } = await api.upsertComfortEntry(entry.payload);
  if (error || !data) throw error || new Error("comfort entry sync failed");
  await saveLocally(fromApiRow(data));
}

export async function refreshFromServer(limit = 30) {
  if (!isOnline()) return getAllEntries();
  const { data, error } = await api.listComfortEntries(limit);
  if (error || !data) return getAllEntries();
  for (const row of data) await saveLocally(fromApiRow(row));
  return getAllEntries();
}
