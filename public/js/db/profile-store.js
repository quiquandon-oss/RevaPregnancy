// The local User profile (data-model.md): a localStorage singleton. Name/due-date/preferences
// stay purely on-device — only the Supabase Auth identity (anonymous or email-linked) ties this
// profile to the server-synced entities.

const KEY = "cc.profile";

function newId() {
  return crypto.randomUUID();
}

export async function getProfile() {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
  return profile;
}

export async function createProfile({ name, dueDate, currentWeek }) {
  const profile = {
    id: newId(),
    name,
    dueDate: dueDate ?? null,
    currentWeek: currentWeek ?? null,
    notificationPrefs: { dispatchUpdates: true, comfortReminders: true },
    disclaimerAcknowledgedAt: null,
    pregnancySafeNotesEnabled: false,
    linkedEmail: null,
    emailLinkedAt: null,
    createdAt: new Date().toISOString(),
  };
  return saveProfile(profile);
}

export async function updateProfile(changes) {
  const existing = (await getProfile()) ?? {};
  const updated = { ...existing, ...changes };
  return saveProfile(updated);
}

export async function acknowledgeDisclaimer() {
  return updateProfile({ disclaimerAcknowledgedAt: new Date().toISOString() });
}
