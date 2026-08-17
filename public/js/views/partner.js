import { bootPage } from "../app.js";
import { getCurrentIdentity } from "../identity.js";
import { acceptInviteAsThisDevice, getThisDeviceMemberRowId, getThisDeviceMember, refreshThisDeviceMember } from "../db/support-store.js";
import { refreshAssigneeDispatches, getCachedDispatches, updateStatus } from "../db/dispatch-store.js";
import { CATEGORY_LABELS, statusLabel, isActive, canTransition } from "../models/dispatch.js";
import { ENERGY_LABELS } from "../models/comfort-entry.js";
import { listOwnerComfortEntries, markDispatchViewed, saveNotificationEmail, getMyNotificationEmail } from "../api-client.js";
import { mountChat } from "../lib/chat.js";
import { isPushSupported, enablePush, getExistingSubscription } from "../lib/push.js";
import { renderPartnerNav } from "../partner-shared.js";

const POLL_INTERVAL_MS = 20000;

let selectedDispatchId = null;
let chatUnsubscribe = null;
let currentOwnerId = null;

function nextAction(status) {
  if (canTransition(status, "accepted")) return { next: "accepted", label: "Accept" };
  if (canTransition(status, "on_the_way")) return { next: "on_the_way", label: "On the way" };
  if (canTransition(status, "delivered")) return { next: "delivered", label: "Delivered" };
  return null;
}

async function openChat(dispatch) {
  if (selectedDispatchId === dispatch.id) return; // already open, nothing to do

  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
  selectedDispatchId = dispatch.id;

  const panel = document.getElementById("chat-panel");
  panel.hidden = false;
  document.getElementById("chat-panel-title").textContent =
    dispatch.itemName || CATEGORY_LABELS[dispatch.category] || "Messages";

  chatUnsubscribe = await mountChat({
    container: document.getElementById("chat-panel-container"),
    dispatchId: dispatch.id,
    myRole: "member",
  });

  try {
    await markDispatchViewed(dispatch.id);
  } catch {
    // Best-effort — the owner just won't see a "Seen" mark yet; not worth failing the chat over.
  }
}

function closeChat() {
  selectedDispatchId = null;
  if (chatUnsubscribe) {
    chatUnsubscribe();
    chatUnsubscribe = null;
  }
  document.getElementById("chat-panel").hidden = true;
}

// Deliberately does NOT touch #chat-panel — it lives outside this function's DOM entirely so
// a poll-driven refresh can never interrupt someone mid-conversation (see partner.html).
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
    const chatBtn = document.createElement("button");
    chatBtn.className = "btn btn-outline btn-block";
    chatBtn.textContent = "💬 Messages";
    chatBtn.addEventListener("click", () => openChat(dispatch));
    card.appendChild(chatBtn);

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
async function refreshComfortIfEligible(member) {
  const section = document.getElementById("comfort-section");
  if (!member) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const { data, error } = await listOwnerComfortEntries(member.ownerId);
  if (!error && data) {
    renderComfort(data.map((row) => ({ date: row.date, energyLevel: row.energy_level, statuses: row.statuses || [] })));
  }
}

async function refreshPushPrompt() {
  const prompt = document.getElementById("push-prompt");
  if (!isPushSupported()) {
    prompt.hidden = true;
    return;
  }
  const existing = await getExistingSubscription();
  prompt.hidden = !!existing;
}

function wirePushPrompt() {
  document.getElementById("enable-push-btn").addEventListener("click", async () => {
    if (!currentOwnerId) return;
    const result = await enablePush(currentOwnerId);
    if (result.ok) {
      document.getElementById("push-prompt").hidden = true;
    }
    // A denial or failure just leaves the prompt showing — no error text needed here; the
    // person can simply try again, or the browser's own permission UI already told them why.
  });
}

function wireNotifyEmail() {
  document.getElementById("save-notify-email").addEventListener("click", async () => {
    const email = document.getElementById("notify-email").value.trim();
    const statusEl = document.getElementById("notify-email-status");
    if (!email || !currentOwnerId) return;
    const { error } = await saveNotificationEmail({ ownerId: currentOwnerId, email });
    statusEl.hidden = false;
    statusEl.textContent = error
      ? "That didn't save — check your connection and try again."
      : "Saved — alerts will also go to this email.";
  });
}

async function refreshAll() {
  await refresh();
  const member = await refreshThisDeviceMember();
  currentOwnerId = member?.ownerId || currentOwnerId;
  const eligible = member && member.status === "accepted" && member.permissionLevel === "full_support_access" ? member : null;
  await refreshComfortIfEligible(eligible);
  await refreshPushPrompt();
  renderPartnerNav("partner.html", !!eligible);
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

  wirePushPrompt();
  wireNotifyEmail();
  document.getElementById("chat-panel-close").addEventListener("click", closeChat);

  const inviteCode = new URLSearchParams(window.location.search).get("invite");
  const existingMember = await getThisDeviceMember();

  // A device can end up holding an invite it accepted previously that's since been revoked
  // and replaced with a fresh one for the same person (exactly what happened testing this: an
  // invite got revoked and re-created). Without comparing invite codes here, once *any* invite
  // had ever been accepted on a device, opening a brand-new invite link would be silently
  // ignored — the device would stay stuck on the old, now-revoked membership forever, with no
  // error and no obvious way to tell why nothing showed up.
  if (inviteCode && (!existingMember || existingMember.inviteCode !== inviteCode)) {
    await handleInviteAcceptance(inviteCode);
    return;
  }

  // No invite code in the URL, and no locally-accepted (still-accepted, not since revoked)
  // membership either — there's nothing to show. This happens opening partner.html directly
  // (a stray bookmark, a link that lost its ?invite= param, or the owner's own device landing
  // here by mistake). Previously this fell through silently to an empty "Requests for you"
  // with a notification prompt and no explanation, which looked broken rather than saying
  // what was actually wrong.
  if (!inviteCode && (!existingMember || existingMember.status !== "accepted")) {
    document.getElementById("no-access-section").hidden = false;
    return;
  }

  document.getElementById("dispatch-list-section").hidden = false;
  document.getElementById("notify-email-card").hidden = false;
  await refreshAll();
  const { data: contact } = await getMyNotificationEmail();
  if (contact?.email) document.getElementById("notify-email").value = contact.email;
  window.setInterval(refresh, POLL_INTERVAL_MS);
  window.setInterval(refreshAll, POLL_INTERVAL_MS * 3); // comfort/nav/push-prompt change less often
}

main();
