// Local cache + offline queue for CravingDispatch (data-model.md). Views call this module, not
// api-client.js directly, so reads work from cache when offline and writes queue automatically.

import { getAll, put, remove } from "./local-store.js";
import { enqueue, listQueued, isOnline } from "./sync-queue.js";
import * as api from "../api-client.js";
import { createDispatchDraft } from "../models/dispatch.js";

const STORE = "dispatches";

function isTempId(id) {
  return typeof id === "string" && id.startsWith("local-");
}

async function cacheAll(records) {
  for (const record of records) await put(STORE, record);
}

export async function getCachedDispatches() {
  const all = await getAll(STORE);
  return all.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
}

function fromApiRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    category: row.category,
    itemName: row.item_name,
    intensity: row.intensity,
    fulfiller: row.fulfiller,
    assignedMemberId: row.assigned_member_id,
    status: row.status,
    requestedAt: row.requested_at,
    statusUpdatedAt: row.status_updated_at,
    memberViewedAt: row.member_viewed_at,
    pending: false,
  };
}

export async function refreshOwnerDispatches(ownerId) {
  if (!isOnline()) return getCachedDispatches();
  const { data, error } = await api.listDispatchesAsOwner(ownerId);
  if (error || !data) return getCachedDispatches();
  await cacheAll(data.map(fromApiRow));
  return getCachedDispatches();
}

export async function refreshAssigneeDispatches(memberRowId) {
  if (!isOnline()) return getCachedDispatches();
  const { data, error } = await api.listDispatchesAsAssignee(memberRowId);
  if (error || !data) return getCachedDispatches();
  await cacheAll(data.map(fromApiRow));
  return getCachedDispatches();
}

export async function getLastDispatch(ownerId) {
  const all = await getCachedDispatches();
  return all.find((d) => d.ownerId === ownerId) || null;
}

// Last 5-10 fulfilled items per category, most recent first (FR-007).
export async function getRecentItemNames(category, limit = 10) {
  const all = await getCachedDispatches();
  const names = [];
  for (const d of all) {
    if (d.category !== category || !d.itemName) continue;
    if (!names.includes(d.itemName)) names.push(d.itemName);
    if (names.length >= limit) break;
  }
  return names;
}

export async function createDispatch(input, ownerId) {
  const draft = createDispatchDraft(input);

  if (isOnline()) {
    const { data, error } = await api.createDispatch(draft);
    if (!error && data) {
      const record = fromApiRow(data);
      await put(STORE, record);
      return record;
    }
    // Fall through to offline queueing if the network call itself failed.
  }

  const tempId = `local-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const optimistic = {
    id: tempId,
    ownerId,
    category: draft.category,
    itemName: draft.itemName,
    intensity: draft.intensity,
    fulfiller: draft.fulfiller,
    assignedMemberId: draft.assignedMemberId,
    status: draft.fulfiller === "self" ? "delivered" : "requested",
    requestedAt: now,
    statusUpdatedAt: now,
    pending: true,
  };
  await put(STORE, optimistic);
  await enqueue({ kind: "dispatch", op: "insert", localId: tempId, payload: draft });
  return optimistic;
}

export async function updateStatus(dispatchId, status) {
  if (isTempId(dispatchId)) {
    // Not yet synced — merge the new status into the still-queued insert instead of the
    // server, and update the local cache immediately.
    const queued = await listQueued();
    const insertEntry = queued.find((e) => e.kind === "dispatch" && e.op === "insert" && e.localId === dispatchId);
    const cached = await getAll(STORE);
    const record = cached.find((d) => d.id === dispatchId);
    if (record) {
      record.status = status;
      record.statusUpdatedAt = new Date().toISOString();
      await put(STORE, record);
    }
    if (insertEntry) {
      // The eventual insert always creates a fresh row; a later status PATCH will follow once
      // it has a real id, so just remember what to apply after sync completes.
      insertEntry.pendingStatusAfterInsert = status;
      await enqueue(insertEntry); // re-put (same id) with the annotation
    }
    return record;
  }

  if (isOnline()) {
    const { data, error } = await api.updateDispatchStatus(dispatchId, status);
    if (!error && data) {
      const record = fromApiRow(data);
      await put(STORE, record);
      return record;
    }
  }

  const cached = await getAll(STORE);
  const record = cached.find((d) => d.id === dispatchId);
  if (record) {
    record.status = status;
    record.statusUpdatedAt = new Date().toISOString();
    record.pending = true;
    await put(STORE, record);
  }
  await enqueue({ kind: "dispatch", op: "update", payload: { id: dispatchId, status } });
  return record;
}

// Passed to sync-queue.replayQueue({ dispatch: dispatchSyncHandler }).
export async function dispatchSyncHandler(entry) {
  if (entry.op === "insert") {
    const { data, error } = await api.createDispatch(entry.payload);
    if (error || !data) throw error || new Error("dispatch sync failed");
    let record = fromApiRow(data);

    if (entry.pendingStatusAfterInsert && entry.pendingStatusAfterInsert !== record.status) {
      const followUp = await api.updateDispatchStatus(record.id, entry.pendingStatusAfterInsert);
      if (!followUp.error && followUp.data) record = fromApiRow(followUp.data);
    }

    await remove(STORE, entry.localId);
    await put(STORE, record);
    return;
  }

  if (entry.op === "update") {
    const { data, error } = await api.updateDispatchStatus(entry.payload.id, entry.payload.status);
    if (error || !data) throw error || new Error("dispatch status sync failed");
    await put(STORE, fromApiRow(data));
  }
}
