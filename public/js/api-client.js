// Thin wrapper around supabase-js: session bootstrap + one function per call described in
// specs/001-crave-and-care-mvp/contracts/api.md. No bundler — supabase-js loads as a plain ES
// module from a CDN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Local dev defaults — printed by `supabase start` (see quickstart.md §2). Edit these two
// constants to point at a deployed Supabase project instead.
const SUPABASE_URL = "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = "REPLACE_WITH_LOCAL_OR_PROJECT_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sessionReady = null;

// Session bootstrap (contracts/api.md): every page gets a Supabase Auth session — anonymous by
// default, or resumed from a prior sign-in (including an email-linked one).
export function ensureSession() {
  if (!sessionReady) {
    sessionReady = (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }
      return supabase.auth.getSession();
    })();
  }
  return sessionReady;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// ---------------------------------------------------------------------------
// Dispatches
// ---------------------------------------------------------------------------

export async function createDispatch({ category, itemName, intensity, fulfiller, assignedMemberId }) {
  return supabase
    .from("dispatches")
    .insert({
      category,
      item_name: itemName ?? null,
      intensity,
      fulfiller,
      assigned_member_id: assignedMemberId ?? null,
    })
    .select()
    .single();
}

export async function listDispatchesAsOwner(ownerId) {
  return supabase.from("dispatches").select("*").eq("owner_id", ownerId).order("requested_at", { ascending: false });
}

export async function listDispatchesAsAssignee(memberRowId) {
  return supabase
    .from("dispatches")
    .select("*")
    .eq("assigned_member_id", memberRowId)
    .order("requested_at", { ascending: false });
}

export async function updateDispatchStatus(dispatchId, status) {
  return supabase.from("dispatches").update({ status }).eq("id", dispatchId).select().single();
}

// ---------------------------------------------------------------------------
// Support network
// ---------------------------------------------------------------------------

export async function createInvite({ permissionLevel = "dispatch_recipient" } = {}) {
  return supabase.from("support_network_members").insert({ permission_level: permissionLevel }).select().single();
}

export async function acceptInvite(inviteCode, displayName) {
  return supabase.rpc("accept_invite", { p_invite_code: inviteCode, p_display_name: displayName ?? null });
}

export async function listSupportNetwork(ownerId) {
  return supabase.from("support_network_members").select("*").eq("owner_id", ownerId).order("invited_at", { ascending: false });
}

export async function updateSupportMember(memberId, changes) {
  return supabase.from("support_network_members").update(changes).eq("id", memberId).select().single();
}

// ---------------------------------------------------------------------------
// Comfort entries
// ---------------------------------------------------------------------------

export async function upsertComfortEntry({ date, energyLevel, statuses }) {
  const payload = { date };
  if (energyLevel !== undefined) payload.energy_level = energyLevel;
  if (statuses !== undefined) payload.statuses = statuses;
  return supabase.from("comfort_entries").upsert(payload, { onConflict: "owner_id,date" }).select().single();
}

export async function getComfortEntry(date) {
  return supabase.from("comfort_entries").select("*").eq("date", date).maybeSingle();
}

export async function listComfortEntries(limit = 30) {
  return supabase.from("comfort_entries").select("*").order("date", { ascending: false }).limit(limit);
}

// ---------------------------------------------------------------------------
// Account linking (optional, FR-031)
// ---------------------------------------------------------------------------

export async function linkEmail(email) {
  return supabase.auth.updateUser({ email });
}

export async function signInWithEmail(email) {
  return supabase.auth.signInWithOtp({ email });
}
