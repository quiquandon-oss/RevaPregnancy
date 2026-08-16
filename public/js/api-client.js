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

// Local dev defaults — printed by `supabase start` (see quickstart.md §2). Edit these two
// constants to point at a deployed Supabase project instead.
const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = "REPLACE_WITH_LOCAL_OR_PROJECT_ANON_KEY";

let clientPromise = null;

function getClient() {
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

export async function createInvite({ permissionLevel = "dispatch_recipient" } = {}) {
  return withClient((client) =>
    client.from("support_network_members").insert({ permission_level: permissionLevel }).select().single()
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

// ---------------------------------------------------------------------------
// Account linking (optional, FR-031)
// ---------------------------------------------------------------------------

export async function linkEmail(email) {
  return withClient((client) => client.auth.updateUser({ email }));
}

export async function signInWithEmail(email) {
  return withClient((client) => client.auth.signInWithOtp({ email }));
}
