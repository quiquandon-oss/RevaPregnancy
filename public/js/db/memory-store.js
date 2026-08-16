// Local-only store for Timeline memories (photos, ultrasounds, milestones) — no server sync.
// Photos are stored as data URLs directly in IndexedDB, which never leaves this device.

import { getAll, put, remove } from "./local-store.js";

export async function listMemories() {
  const all = await getAll("memories");
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function saveMemory(memory) {
  await put("memories", memory);
  return memory;
}

export async function deleteMemory(id) {
  return remove("memories", id);
}
