// Thin wrapper around supabase-js: session bootstrap + one function per call described in
// specs/001-crave-and-care-mvp/contracts/api.md. No bundler — supabase-js loads as a plain ES
// module from a CDN.
//
// The CDN import (and every network call it makes) is loaded lazily and wrapped so a failure —
// no connectivity, CDN unreachable, Supabase down — can never throw out of this module at
// import time or block a caller. Every exported function always resolves to a `{ data, error }`
// shape, exactly like a normal supabase-js call, so dispatch-store.js / comfort-store.js /
// support-store.js's existing "fall back to the offline queue on error" logic just works,
// without those callers needing to know whether the failure was a query error or a totally
// absent client. This is what constitution Principle V (offline-first) requires: a page that
// only needs local data must never be blocked by a network-dependent import failing.

// Points at the live "crave-and-care" Supabase project (see README.md). For local development
// against `supabase start` instead, swap these for the URL/anon key it prints (quickstart.md §2).
const SUPABASE_URL = "https://zwxfmdhgnlhtkixfkdob.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JsU8RCkahoM0FS9bQ9clTQ_VpEGmC7u";

let clientPromise = null;

export function getClient() {
  if (!clientPromise) {
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
      .catch((error) => {
        clientPromise = null; // allow retrying on a later call once connectivity returns
        throw error;
      });
  }
  return clientPromise;
}

// Wraps a function that needs the live client so any failure (import, network, or the call
// itself) becomes a `{ data: null, error }` result instead of a thrown exception.
async function withClient(fn) {
  try {
    const client = await getClient();
    return await fn(client);
  } catch (error) {
    return { data: null, error };
  }
}

let sessionReady = null;

// Session bootstrap (contracts/api.md): every page gets a Supabase Auth session — anonymous by
// default, or resumed from a prior sign-in (including an email-linked one). Never throws: if
// this fails (offline, CDN unreachable), the app proceeds local-only and retries next call.
export function ensureSession() {
  if (!sessionReady) {
    sessionReady = withClient(async (client) => {
      const { data } = await client.auth.getSession();
      if (!data.session) {
        const { error } = await client.auth.signInAnonymously();
        if (error) return { data: null, error };
      }
      return client.auth.getSession();
    }).then((result) => {
      if (result.error) sessionReady = null; // don't cache a failure; retry on next page/call
      return result;
    });
  }
  return sessionReady;
}

export async function onAuthStateChange(callback) {
  try {
    const client = await getClient();
    return client.auth.onAuthStateChange(callback);
  } catch {
    return { data: { subscription: { unsubscribe() {} } } };
  }
}

export async function getSupabaseClient() {
  return getClient();
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

export async function createDispatch({ category, itemName, intensity, fulfiller, assignedMemberId }) {
  return withClient((client) =>
    client
      .from("dispatches")
      .insert({
        category,
        item_name: itemName ?? null,
        intensity,
        fulfiller,
        assigned_member_id: assignedMemberId ?? null,
      })
      .select()
      .single()
  );
}

export async function listDispatchesAsOwner(ownerId) {
  return withClient((client) =>
    client.from("dispatches").select("*").eq("owner_id", ownerId).order("requested_at", { ascending: false })
  );
}

export async function listDispatchesAsAssignee(memberRowId) {
  return withClient((client) =>
    client
      .from("dispatches")
      .select("*")
      .eq("assigned_member_id", memberRowId)
      .order("requested_at", { ascending: false })
  );
}

export async function updateDispatchStatus(dispatchId, status) {
  return withClient((client) => client.from("dispatches").update({ status }).eq("id", dispatchId).select().single());
}

// ---------------------------------------------------------------------------
// Support network
// ---------------------------------------------------------------------------

export async function createInvite({ permissionLevel = "dispatch_recipient", displayName = null } = {}) {
  return withClient((client) =>
    client
      .from("support_network_members")
      .insert({ permission_level: permissionLevel, display_name: displayName })
      .select()
      .single()
  );
}

export async function acceptInvite(inviteCode, displayName) {
  return withClient((client) =>
    client.rpc("accept_invite", { p_invite_code: inviteCode, p_display_name: displayName ?? null })
  );
}

export async function listSupportNetwork(ownerId) {
  return withClient((client) =>
    client.from("support_network_members").select("*").eq("owner_id", ownerId).order("invited_at", { ascending: false })
  );
}

export async function updateSupportMember(memberId, changes) {
  return withClient((client) => client.from("support_network_members").update(changes).eq("id", memberId).select().single());
}

export async function getSupportMember(memberId) {
  return withClient((client) => client.from("support_network_members").select("*").eq("id", memberId).single());
}

// ---------------------------------------------------------------------------
// Comfort entries
// ---------------------------------------------------------------------------

export async function upsertComfortEntry({ date, energyLevel, statuses }) {
  const payload = { date };
  if (energyLevel !== undefined) payload.energy_level = energyLevel;
  if (statuses !== undefined) payload.statuses = statuses;
  return withClient((client) =>
    client.from("comfort_entries").upsert(payload, { onConflict: "owner_id,date" }).select().single()
  );
}

export async function getComfortEntry(date) {
  return withClient((client) => client.from("comfort_entries").select("*").eq("date", date).maybeSingle());
}

export async function listComfortEntries(limit = 30) {
  return withClient((client) => client.from("comfort_entries").select("*").order("date", { ascending: false }).limit(limit));
}

// For a support-network member with full_support_access reading the owner's mood/energy
// history — scoped by RLS to accepted, full_support_access members only (see migration
// 0002_support_member_comfort_access.sql).
export async function listOwnerComfortEntries(ownerId, limit = 30) {
  return withClient((client) =>
    client.from("comfort_entries").select("*").eq("owner_id", ownerId).order("date", { ascending: false }).limit(limit)
  );
}

// ---------------------------------------------------------------------------
// Timeline memories (photos, ultrasounds, milestones) — synced, see
// supabase/migrations/0003_memories_sync.sql. Photo binaries live in the "memories" Storage
// bucket, not in this table; photo_path points at them. Providing `id` on insert (rather than
// letting the DB default generate one) keeps the local device's id identical to the server's,
// so there's no id-remapping step once a write syncs.
// ---------------------------------------------------------------------------

export async function createMemoryRecord({ id, title, date, category, note, photoPath }) {
  return withClient((client) =>
    client
      .from("memories")
      .insert({ id, title, date, category, note, photo_path: photoPath })
      .select()
      .single()
  );
}

export async function deleteMemoryRecord(id) {
  return withClient((client) => client.from("memories").delete().eq("id", id));
}

export async function listMyMemories(limit = 200) {
  return withClient((client) => client.from("memories").select("*").order("date", { ascending: false }).limit(limit));
}

// For a full_support_access support-network member reading the owner's Timeline.
export async function listOwnerMemories(ownerId, limit = 20) {
  return withClient((client) =>
    client.from("memories").select("*").eq("owner_id", ownerId).order("date", { ascending: false }).limit(limit)
  );
}

export async function uploadMemoryPhoto(path, blob) {
  return withClient((client) =>
    client.storage.from("memories").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true })
  );
}

// The bucket is private, so viewing a photo (owner on another device, or a partner) needs a
// short-lived signed URL rather than a plain public one.
export async function getMemoryPhotoSignedUrl(path, expiresIn = 3600) {
  return withClient((client) => client.storage.from("memories").createSignedUrl(path, expiresIn));
}

export async function deleteMemoryPhoto(path) {
  return withClient((client) => client.storage.from("memories").remove([path]));
}

// A full_support_access support-network member adding a memory on the owner's behalf — see
// create_memory_as_support_member() in 0005_chat_and_push_notifications.sql. Regular direct
// inserts (createMemoryRecord above) only work for the owner themselves.
export async function createMemoryAsSupportMember({ ownerId, title, date, category, note, photoPath }) {
  return withClient((client) =>
    client.rpc("create_memory_as_support_member", {
      p_owner_id: ownerId,
      p_title: title,
      p_date: date,
      p_category: category,
      p_note: note,
      p_photo_path: photoPath,
    })
  );
}

// ---------------------------------------------------------------------------
// Per-dispatch chat + read receipts
// ---------------------------------------------------------------------------

export async function listDispatchMessages(dispatchId) {
  return withClient((client) =>
    client.from("dispatch_messages").select("*").eq("dispatch_id", dispatchId).order("created_at", { ascending: true })
  );
}

export async function sendDispatchMessage(dispatchId, body) {
  return withClient((client) => client.from("dispatch_messages").insert({ dispatch_id: dispatchId, body }).select().single());
}

export async function markMessageRead(messageId) {
  return withClient((client) => client.from("dispatch_messages").update({}).eq("id", messageId).select().single());
}

// Subscribes to new/changed messages on one dispatch in real time (Postgres changes via
// Supabase Realtime), rather than the 20s polling used elsewhere — a chat feels wrong on a
// 20-second delay. Returns an unsubscribe function; caller must call it if the caller may be
// re-invoked (e.g. re-opening the same dispatch), to avoid stacking duplicate subscriptions.
export async function subscribeToDispatchMessages(dispatchId, onChange) {
  let client;
  try {
    client = await getClient();
  } catch {
    return () => {};
  }
  const channel = client
    .channel(`dispatch-messages-${dispatchId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dispatch_messages", filter: `dispatch_id=eq.${dispatchId}` },
      onChange
    )
    .subscribe();
  return () => client.removeChannel(channel);
}

export async function markDispatchViewed(dispatchId) {
  return withClient((client) => client.rpc("mark_dispatch_viewed", { p_dispatch_id: dispatchId }));
}

// ---------------------------------------------------------------------------
// Push notifications (Web Push)
// ---------------------------------------------------------------------------

export const VAPID_PUBLIC_KEY =
  "BBQti0gRRvMx9OVorDTUBAsYz3uwGBdVh7zuCzNDqG7V2oQVXhogCSZwBadpuEREeJsChFrZUZteLMhS0RrMpYw";

export async function savePushSubscription({ ownerId, endpoint, p256dh, authKey }) {
  return withClient((client) =>
    client
      .from("push_subscriptions")
      .upsert({ owner_id: ownerId, endpoint, p256dh, auth_key: authKey }, { onConflict: "endpoint" })
      .select()
      .single()
  );
}

export async function deletePushSubscription(endpoint) {
  return withClient((client) => client.from("push_subscriptions").delete().eq("endpoint", endpoint));
}

// ---------------------------------------------------------------------------
// Account linking (optional, FR-031)
// ---------------------------------------------------------------------------

export async function linkEmail(email) {
  return withClient((client) => client.auth.updateUser({ email }));
}

export async function signInWithEmail(email) {
  return withClient((client) => client.auth.signInWithOtp({ email }));
}
