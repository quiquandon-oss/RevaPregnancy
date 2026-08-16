// Offline write queue: any write that needs Supabase but the network is unavailable (or the
// write fails) gets queued here, and replayed on reconnect. Used by dispatch-store.js,
// comfort-store.js, and support-store.js — the three Supabase-synced entities.

import { getAll, put, remove } from "./local-store.js";

const STORE = "syncQueue";
const listeners = new Set();

// entry: { id?, kind: 'dispatch'|'comfort'|'support', op: 'insert'|'update'|'rpc', payload, createdAt }
export async function enqueue(entry) {
  const record = { ...entry, createdAt: entry.createdAt || new Date().toISOString() };
  const id = await put(STORE, record);
  return id;
}

export async function listQueued() {
  const all = await getAll(STORE);
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function dequeue(id) {
  await remove(STORE, id);
}

// `handlers` maps a queue entry's `kind` to an async function that performs the real write.
// Called once per replay pass; entries that succeed are dequeued, failures stay queued.
export async function replayQueue(handlers) {
  const queued = await listQueued();
  for (const entry of queued) {
    const handler = handlers[entry.kind];
    if (!handler) continue;
    try {
      await handler(entry);
      await dequeue(entry.id);
      notify({ status: "synced", entry });
    } catch (error) {
      notify({ status: "failed", entry, error });
      // Leave it queued; it will retry on the next replay pass.
    }
  }
}

export function onSyncEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(event) {
  for (const listener of listeners) listener(event);
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function watchConnectivity(onReconnect) {
  if (typeof window === "undefined") return;
  window.addEventListener("online", onReconnect);
}
