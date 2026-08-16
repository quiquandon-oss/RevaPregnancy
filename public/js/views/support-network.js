import { bootPage } from "../app.js";
import { getCurrentIdentity } from "../identity.js";
import { refreshSupportNetwork, createInvite, revokeMember } from "../db/support-store.js";
import { inviteLink, PERMISSION_LABELS } from "../models/support-member.js";

let ownerId = null;

function renderMembers(members) {
  const list = document.getElementById("member-list");
  const empty = document.getElementById("empty-members");
  list.innerHTML = "";
  empty.hidden = members.length > 0;

  for (const member of members) {
    const card = document.createElement("div");
    card.className = "card row-between";
    const label = member.displayName || (member.status === "pending" ? "Invite pending" : "Support person");
    card.innerHTML = `
      <span class="stack" style="gap: 2px">
        <strong>${label}</strong>
        <span class="micro">${PERMISSION_LABELS[member.permissionLevel] || member.permissionLevel} &middot; ${member.status}</span>
      </span>
    `;
    if (member.status !== "revoked") {
      const revokeBtn = document.createElement("button");
      revokeBtn.className = "btn btn-danger";
      revokeBtn.textContent = "Revoke";
      revokeBtn.addEventListener("click", async () => {
        await revokeMember(member.id);
        await refresh();
      });
      card.appendChild(revokeBtn);
    }
    list.appendChild(card);
  }
}

async function refresh() {
  const members = await refreshSupportNetwork(ownerId);
  renderMembers(members);
}

function wireCreateInvite() {
  document.getElementById("create-invite").addEventListener("click", async () => {
    const errorEl = document.getElementById("invite-error");
    errorEl.hidden = true;
    try {
      const member = await createInvite("dispatch_recipient");
      const link = inviteLink(member.inviteCode);
      document.getElementById("invite-link").value = link;
      document.getElementById("new-invite-card").hidden = false;
      await refresh();
    } catch (error) {
      errorEl.textContent = "That didn't go through — check your connection and try again in a moment.";
      errorEl.hidden = false;
    }
  });
}

function wireCopyLink() {
  document.getElementById("copy-invite-link").addEventListener("click", async () => {
    const input = document.getElementById("invite-link");
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      // Clipboard access can be blocked in some contexts; the link is still visible/selected
      // for a manual copy, so this is a silent, non-blocking fallback.
    }
  });
}

async function main() {
  await bootPage();
  const identity = await getCurrentIdentity();
  ownerId = identity.ownerId;
  wireCreateInvite();
  wireCopyLink();
  await refresh();
}

main();
