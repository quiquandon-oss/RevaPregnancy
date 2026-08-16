// Local cache + Supabase sync for SupportNetworkMember (data-model.md).

import { getAll, put } from "./local-store.js";
import * as api from "../api-client.js";

const STORE = "supportMembers";
const MEMBER_ROW_ID_KEY = "cc.memberRowId"; // set on this device once it accepts an invite

function fromApiRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    displayName: row.display_name,
    permissionLevel: row.permission_level,
    inviteCode: row.invite_code,
    memberAuthId: row.member_auth_id,
    status: row.status,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
  };
}

export async function refreshSupportNetwork(ownerId) {
  const { data, error } = await api.listSupportNetwork(ownerId);
  if (error || !data) return getCachedMembers();
  for (const row of data) await put(STORE, fromApiRow(row));
  return getCachedMembers();
}

export async function getCachedMembers() {
  const all = await getAll(STORE);
  return all.sort((a, b) => (b.invitedAt || "").localeCompare(a.invitedAt || ""));
}

export async function listAcceptedSupportMembers() {
  const all = await getCachedMembers();
  return all.filter((m) => m.status === "accepted");
}

export async function createInvite(permissionLevel = "dispatch_recipient") {
  const { data, error } = await api.createInvite({ permissionLevel });
  if (error) throw error;
  const record = fromApiRow(data);
  await put(STORE, record);
  return record;
}

export async function acceptInviteAsThisDevice(inviteCode, displayName) {
  const { data, error } = await api.acceptInvite(inviteCode, displayName);
  if (error) throw error;
  const record = fromApiRow(data);
  await put(STORE, record);
  localStorage.setItem(MEMBER_ROW_ID_KEY, record.id);
  return record;
}

export function getThisDeviceMemberRowId() {
  return localStorage.getItem(MEMBER_ROW_ID_KEY);
}

export async function revokeMember(memberId) {
  const { data, error } = await api.updateSupportMember(memberId, { status: "revoked" });
  if (error) throw error;
  const record = fromApiRow(data);
  await put(STORE, record);
  return record;
}

export async function updatePermissionLevel(memberId, permissionLevel) {
  const { data, error } = await api.updateSupportMember(memberId, { permission_level: permissionLevel });
  if (error) throw error;
  const record = fromApiRow(data);
  await put(STORE, record);
  return record;
}
