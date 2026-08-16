// Local cache + offline sync queue for Timeline memories (data-model.md). Same pattern as
// dispatch-store.js/comfort-store.js: reads come from cache (always works offline), writes try
// Supabase first and queue on failure.
//
// Photos are kept on this device at full quality for instant, fully-offline display — that
// never changes. What's new is that a *compressed* copy is also pushed to Supabase Storage
// alongside a metadata row, so a) the owner's other devices and b) an invited
// full_support_access partner can see them too. See supabase/migrations/0003_memories_sync.sql.

import { getAll, get, put, remove } from "./local-store.js";
import { enqueue, isOnline } from "./sync-queue.js";
import * as api from "../api-client.js";
import { compressImage } from "../lib/image-compress.js";

const STORE = "memories";

export async function listMemories() {
  const all = await getAll(STORE);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Does the actual Supabase work for one memory: compress + upload the photo (if any), then
// write the metadata row. Throws on any failure so callers can fall back to the offline queue.
async function syncMemory(memory) {
  const { getCurrentIdentity } = await import("../identity.js");
  const { ownerId } = await getCurrentIdentity();
  if (!ownerId) throw new Error("No session yet — can't sync this memory");

  let photoPath = null;
  if (memory.photoDataUrl) {
    const compressed = await compressImage(await dataUrlToBlob(memory.photoDataUrl));
    photoPath = `${ownerId}/${memory.id}.jpg`;
    const { error: uploadError } = await api.uploadMemoryPhoto(photoPath, compressed);
    if (uploadError) throw uploadError;
  }

  const { data, error } = await api.createMemoryRecord({
    id: memory.id,
    title: memory.title,
    date: memory.date,
    category: memory.category,
    note: memory.note,
    photoPath,
  });
  if (error || !data) throw error || new Error("memory sync failed");

  return { ...memory, ownerId, photoPath: data.photo_path, pending: false };
}

export async function saveMemory(memory) {
  const local = { ...memory, pending: true };
  await put(STORE, local);

  if (isOnline()) {
    try {
      const synced = await syncMemory(memory);
      await put(STORE, synced);
      return synced;
    } catch {
      // Fall through to offline queueing below.
    }
  }

  await enqueue({ kind: "memory", op: "insert", memoryId: memory.id });
  return local;
}

// Passed to sync-queue.replayQueue({ memory: memorySyncHandler }) — see app.js.
export async function memorySyncHandler(entry) {
  const local = await get(STORE, entry.memoryId);
  if (!local) return; // deleted locally before it ever synced — nothing left to do
  const synced = await syncMemory(local);
  await put(STORE, synced);
}

export async function deleteMemory(id) {
  const local = await get(STORE, id);
  await remove(STORE, id);
  if (!local || local.pending || !isOnline()) return;

  // Best-effort remote cleanup for an already-synced memory. Not queued for retry like
  // creation is — the local delete has already happened either way, so a stray row/photo left
  // behind by a failed delete here is a minor, non-blocking edge case rather than something
  // worth another whole offline-retry path for.
  try {
    if (local.photoPath) await api.deleteMemoryPhoto(local.photoPath);
    await api.deleteMemoryRecord(id);
  } catch {
    // See comment above.
  }
}

async function fetchPhotoAsDataUrl(path) {
  const { data, error } = await api.getMemoryPhotoSignedUrl(path);
  if (error || !data?.signedUrl) return null;
  try {
    return await blobToDataUrl(await (await fetch(data.signedUrl)).blob());
  } catch {
    return null;
  }
}

// Pulls the owner's own synced memories down — used on every Timeline visit (picks up
// anything saved from another device) and on first resume on a brand-new device (app.js).
// Photos already cached locally aren't re-downloaded.
export async function refreshFromServer(limit = 200) {
  if (!isOnline()) return listMemories();
  const { data, error } = await api.listMyMemories(limit);
  if (error || !data) return listMemories();

  for (const row of data) {
    const existing = await get(STORE, row.id);
    if (existing?.photoDataUrl || existing?.pending) continue; // already have it, or a local edit is still queued
    const photoDataUrl = row.photo_path ? await fetchPhotoAsDataUrl(row.photo_path) : null;
    await put(STORE, {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      date: row.date,
      category: row.category,
      note: row.note || "",
      photoDataUrl,
      photoPath: row.photo_path,
      createdAt: row.created_at,
      pending: false,
    });
  }
  return listMemories();
}
