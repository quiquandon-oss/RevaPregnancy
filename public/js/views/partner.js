import { bootPage } from "../app.js";
import { getCurrentIdentity } from "../identity.js";
import { acceptInviteAsThisDevice, getThisDeviceMemberRowId, refreshThisDeviceMember } from "../db/support-store.js";
import { refreshAssigneeDispatches, getCachedDispatches, updateStatus } from "../db/dispatch-store.js";
import { CATEGORY_LABELS, statusLabel, isActive, canTransition } from "../models/dispatch.js";
import { ENERGY_LABELS } from "../models/comfort-entry.js";
import { listOwnerComfortEntries } from "../api-client.js";

const POLL_INTERVAL_MS = 20000;

function nextAction(status) {
  if (canTransition(status, "accepted")) return { next: "accepted", label: "Accept" };
  if (canTransition(status, "on_the_way")) return { next: "on_the_way", label: "On the way" };
  if (canTransition(status, "delivered")) return { next: "delivered", label: "Delivered" };
  return null;
}

function renderList(dispatches) {
  const list = document.getElementById("dispatch-list");
  const empty = document.getElementById("empty-list");
  const active = dispatches.filter(isActive);
  list.innerHTML = "";
  empty.hidden = active.length > 0;

  for (const dispatch of active) {
    const card = document.createElement("div");
    card.className = "card stack";
    const label = CATEGORY_LABELS[dispatch.category] || dispatch.category;
    const action = nextAction(dispatch.status);
    card.innerHTML = `
      <div class="row-between">
        <strong>${dispatch.itemName || label}</strong>
        <span class="status-pill">${statusLabel(dispatch.status)}</span>
      </div>
      <p class="micro">${label} &middot; Intensity ${dispatch.intensity}/5</p>
    `;
    if (action) {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary btn-block";
      btn.textContent = action.label;
      btn.addEventListener("click", async () => {
        await updateStatus(dispatch.id, action.next);
        await refresh();
      });
      card.appendChild(btn);
    }
    list.appendChild(card);
  }
}

async function refresh() {
  const memberRowId = getThisDeviceMemberRowId();
  if (!memberRowId) return;
  await refreshAssigneeDispatches(memberRowId);
  const all = await getCachedDispatches();
  renderList(all.filter((d) => d.assignedMemberId === memberRowId));
}

function renderComfort(entries) {
  const list = document.getElementById("comfort-list");
  const empty = document.getElementById("empty-comfort");
  list.innerHTML = "";
  empty.hidden = entries.length > 0;

  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "card stack";
    const energy = entry.energyLevel ? ENERGY_LABELS[entry.energyLevel] || entry.energyLevel : null;
    const statuses = (entry.statuses || []).map((s) => s.label).join(", ");
    card.innerHTML = `
      <div class="row-between">
        <strong>${entry.date}</strong>
        ${energy ? `<span class="status-pill">${energy}</span>` : ""}
      </div>
      ${statuses ? `<p class="micro">${statuses}</p>` : ""}
    `;
    list.appendChild(card);
  }
}

// Full_support_access is opt-in per invite (the owner chooses this when creating the
// invite), so re-checks the member's own record from the server each time rather than
// trusting a locally-cached permission level — the owner can also change it later.
async function refreshComfortIfEligible() {
  const member = await refreshThisDeviceMember();
  const section = document.getElementById("comfort-section");
  if (!member || member.status !== "accepted" || member.permissionLevel !== "full_support_access") {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const { data, error } = await listOwnerComfortEntries(member.ownerId);
  if (!error && data) {
    renderComfort(data.map((row) => ({ date: row.date, energyLevel: row.energy_level, statuses: row.statuses || [] })));
  }
}

async function refreshAll() {
  await refresh();
  await refreshComfortIfEligible();
}

async function handleInviteAcceptance(inviteCode) {
  document.getElementById("accept-section").hidden = false;
  document.getElementById("accept-invite-btn").addEventListener("click", async () => {
    const errorEl = document.getElementById("accept-error");
    errorEl.hidden = true;
    const displayName = document.getElementById("display-name").value.trim() || undefined;
    try {
      await acceptInviteAsThisDevice(inviteCode, displayName);
      document.getElementById("accept-section").hidden = true;
      document.getElementById("dispatch-list-section").hidden = false;
      await refreshAll();
    } catch (error) {
      errorEl.textContent = "That invite link doesn't seem to work anymore — worth double-checking with the person who sent it.";
      errorEl.hidden = false;
    }
  });
}

async function main() {
  await bootPage({ skipDisclaimerGate: true });
  await getCurrentIdentity(); // ensures an anonymous session exists for a brand-new device

  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  const existingMemberRowId = getThisDeviceMemberRowId();

  if (inviteCode && !existingMemberRowId) {
    await handleInviteAcceptance(inviteCode);
    return;
  }

  document.getElementById("dispatch-list-section").hidden = false;
  await refreshAll();
  window.setInterval(refreshAll, POLL_INTERVAL_MS);
}

main();
