import { bootPage, setMotionPreference, setContrastPreference } from "../app.js";
import { getProfile, updateProfile } from "../db/profile-store.js";
import { linkEmail } from "../api-client.js";
import { listAcceptedSupportMembers } from "../db/support-store.js";
import { getCurrentIdentity } from "../identity.js";
import { isPushSupported, enablePush, getExistingSubscription } from "../lib/push.js";

async function populateDefaultFulfiller(profile) {
  const select = document.getElementById("default-fulfiller");
  const members = await listAcceptedSupportMembers().catch(() => []);
  for (const member of members) {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.displayName || "Support person";
    select.appendChild(option);
  }
  // Falls back to "Just me" if the previously-chosen person was revoked since — the option
  // simply won't exist anymore, and an unmatched value leaves a <select> on its first option.
  select.value = profile.defaultFulfillerId || "";
}

async function loadIntoForm() {
  const profile = await getProfile();
  if (!profile) return;
  document.getElementById("profile-name").value = profile.name || "";
  document.getElementById("profile-due-date").value = profile.dueDate || "";
  document.getElementById("profile-week").value = profile.currentWeek || "";
  document.getElementById("pref-dispatch-updates").checked = !!profile.notificationPrefs?.dispatchUpdates;
  document.getElementById("pref-comfort-reminders").checked = !!profile.notificationPrefs?.comfortReminders;
  document.getElementById("pref-safe-notes").checked = !!profile.pregnancySafeNotesEnabled;
  document.getElementById("pref-reduced-motion").checked = localStorage.getItem("cc.motion") === "reduced";
  document.getElementById("pref-high-contrast").checked = localStorage.getItem("cc.contrast") === "high";
  await populateDefaultFulfiller(profile);
  renderLinkStatus(profile);
}

function renderLinkStatus(profile) {
  const statusEl = document.getElementById("link-status");
  const formEl = document.getElementById("link-form");
  if (profile.linkedEmail && profile.emailLinkedAt) {
    statusEl.textContent = `Linked to ${profile.linkedEmail}. You can open Crave & Care on another device and sign in with this email to see your data there.`;
    formEl.hidden = true;
  } else if (profile.linkedEmail) {
    statusEl.textContent = `Almost there — check ${profile.linkedEmail} for a confirmation link.`;
  } else {
    statusEl.textContent = "Not linked yet — this is entirely optional.";
  }
}

function wireSave() {
  document.getElementById("save-profile").addEventListener("click", async () => {
    await updateProfile({
      name: document.getElementById("profile-name").value.trim(),
      dueDate: document.getElementById("profile-due-date").value || null,
      currentWeek: document.getElementById("profile-week").value ? Number(document.getElementById("profile-week").value) : null,
      notificationPrefs: {
        dispatchUpdates: document.getElementById("pref-dispatch-updates").checked,
        comfortReminders: document.getElementById("pref-comfort-reminders").checked,
      },
      pregnancySafeNotesEnabled: document.getElementById("pref-safe-notes").checked,
      defaultFulfillerId: document.getElementById("default-fulfiller").value || null,
    });
  });

  document.getElementById("pref-reduced-motion").addEventListener("change", (e) => {
    setMotionPreference(e.target.checked ? "reduced" : "full");
  });
  document.getElementById("pref-high-contrast").addEventListener("change", (e) => {
    setContrastPreference(e.target.checked ? "high" : "normal");
  });
}

function wireEmailLink() {
  document.getElementById("link-email-btn").addEventListener("click", async () => {
    const email = document.getElementById("link-email").value.trim();
    const statusEl = document.getElementById("link-status");
    if (!email) return;
    statusEl.textContent = "Sending a confirmation link...";
    // Normal app use is never blocked while this is pending (FR-031) — this call simply runs
    // in the background and the rest of the page stays fully usable either way.
    const { error } = await linkEmail(email);
    if (error) {
      statusEl.textContent = "That didn't quite go through — want to try again?";
      return;
    }
    await updateProfile({ linkedEmail: email, emailLinkedAt: null });
    statusEl.textContent = `Almost there — check ${email} for a confirmation link.`;
  });

  window.addEventListener("cc:auth-changed", async () => {
    const profile = await getProfile();
    if (profile?.linkedEmail && !profile.emailLinkedAt) {
      await updateProfile({ emailLinkedAt: new Date().toISOString() });
    }
    loadIntoForm();
  });
}

async function refreshPushUi() {
  const prompt = document.getElementById("push-prompt");
  const enabledNotice = document.getElementById("push-enabled-notice");
  if (!isPushSupported()) {
    prompt.hidden = true;
    enabledNotice.hidden = true;
    return;
  }
  const existing = await getExistingSubscription();
  prompt.hidden = !!existing;
  enabledNotice.hidden = !existing;
}

function wirePushToggle() {
  document.getElementById("enable-push-btn").addEventListener("click", async () => {
    const { ownerId } = await getCurrentIdentity();
    const result = await enablePush(ownerId);
    if (result.ok) await refreshPushUi();
    // A denial/failure just leaves the prompt showing; the browser's own permission UI
    // already explains why if the person said no.
  });
}

async function main() {
  await bootPage();
  await loadIntoForm();
  wireSave();
  wireEmailLink();
  wirePushToggle();
  await refreshPushUi();
  const { ownerId } = await getCurrentIdentity();
  document.getElementById("account-id").textContent = ownerId || "Not available yet — try again in a moment.";
}

main();
