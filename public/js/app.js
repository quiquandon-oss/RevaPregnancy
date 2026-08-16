// Shared boot logic loaded by every page: bottom nav, accessibility preferences, Supabase
// session init, disclaimer gate, and the magic-link confirmation handler.
import { ensureSession, onAuthStateChange } from "./api-client.js";
import { getProfile } from "./db/profile-store.js";

const NAV_ITEMS = [
  { href: "index.html", label: "Home", icon: "🏠" },
  { href: "comfort.html", label: "Comfort", icon: "🌿" },
  { href: "care.html", label: "Care", icon: "🗓️" },
  { href: "timeline.html", label: "Timeline", icon: "📷" },
  { href: "profile.html", label: "Profile", icon: "👤" },
];

const PAGES_WITHOUT_NAV = ["onboarding.html", "partner.html"];
// partner.html is a support-network member's own view, not the pregnant user's — it has its
// own invite-based entry flow and never goes through this app's onboarding/disclaimer.
const PAGES_EXEMPT_FROM_DISCLAIMER_GATE = ["onboarding.html", "partner.html"];

export function currentPage() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  return path;
}

function renderBottomNav() {
  if (PAGES_WITHOUT_NAV.includes(currentPage())) return;
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Primary");
  for (const item of NAV_ITEMS) {
    const link = document.createElement("a");
    link.className = "bottom-nav__item";
    link.href = item.href;
    link.innerHTML = `<span aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    if (item.href === currentPage()) link.setAttribute("aria-current", "page");
    nav.appendChild(link);
  }
  document.body.appendChild(nav);
}

function applyAccessibilityPreferences() {
  const motion = localStorage.getItem("cc.motion"); // 'reduced' | 'full' | null
  const contrast = localStorage.getItem("cc.contrast"); // 'high' | null
  if (motion) document.documentElement.setAttribute("data-motion", motion);
  if (contrast) document.documentElement.setAttribute("data-contrast", contrast);
}

export function setMotionPreference(value) {
  localStorage.setItem("cc.motion", value);
  document.documentElement.setAttribute("data-motion", value);
}

export function setContrastPreference(value) {
  if (value === "high") {
    localStorage.setItem("cc.contrast", "high");
    document.documentElement.setAttribute("data-contrast", "high");
  } else {
    localStorage.removeItem("cc.contrast");
    document.documentElement.removeAttribute("data-contrast");
  }
}

// Disclaimer gate (FR-025): any page except onboarding itself redirects here until the
// disclaimer has been acknowledged once.
async function enforceDisclaimerGate() {
  if (PAGES_EXEMPT_FROM_DISCLAIMER_GATE.includes(currentPage())) return;
  const profile = await getProfile();
  if (!profile || !profile.disclaimerAcknowledgedAt) {
    window.location.href = "onboarding.html";
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Offline caching is a progressive enhancement; a failed registration shouldn't block use.
    });
  });
}

// Handles the "resume on a second device" magic-link callback (research.md #8, contracts/api.md).
// Supabase appends auth tokens to the URL hash/query on redirect back from the emailed link;
// supabase-js's detectSessionInUrl (on by default) completes the sign-in automatically. We react
// to the resulting auth state change — first by telling every page a link/sign-in just
// completed (profile.js listens for this to mark its own "linked" status), and separately, only
// when this device has no local profile yet, by pulling down the existing Supabase-synced data
// (dispatches, support-network members, comfort entries, Timeline memories) so a genuinely new
// device ends up showing the same data as the original one, per contracts/api.md's
// account-linking contract.
async function handleResumeOnNewDevice(ownerId) {
  const existingProfile = await getProfile();
  if (existingProfile) return; // "link my current device" path — it already has all its data

  const [
    { refreshOwnerDispatches },
    { refreshFromServer: refreshComfortFromServer },
    { refreshSupportNetwork },
    { createProfile, acknowledgeDisclaimer },
    { refreshFromServer: refreshMemoriesFromServer },
  ] = await Promise.all([
    import("./db/dispatch-store.js"),
    import("./db/comfort-store.js"),
    import("./db/support-store.js"),
    import("./db/profile-store.js"),
    import("./db/memory-store.js"),
  ]);

  await Promise.all([
    refreshOwnerDispatches(ownerId),
    refreshComfortFromServer(),
    refreshSupportNetwork(ownerId),
    refreshMemoriesFromServer(),
  ]);

  // Local-only profile fields (name, due date) never left the original device, so this device
  // needs a placeholder shell — the disclaimer was already acknowledged once by this same
  // person, so it isn't shown again as a blocking step (FR-025 only requires it once, not once
  // per device).
  await createProfile({ name: "", dueDate: null, currentWeek: null });
  await acknowledgeDisclaimer();

  if (currentPage() !== "profile.html") window.location.href = "profile.html";
}

function watchAuthState() {
  onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" || event === "USER_UPDATED") {
      window.dispatchEvent(new CustomEvent("cc:auth-changed", { detail: { event } }));
      if (event === "SIGNED_IN" && session?.user?.id && !session.user.is_anonymous) {
        await handleResumeOnNewDevice(session.user.id);
      }
    }
  });
}

// Replays anything left in the offline sync queue (see db/sync-queue.js). This was previously
// defined but never actually invoked anywhere in the app — queued writes (e.g. a dispatch
// created while offline) would sit in IndexedDB indefinitely with nothing to send them once
// connectivity returned. Wired up here, on every page, so it applies to all queued kinds, not
// just the new memory-sync one this was added for.
async function wireSyncQueue() {
  const [{ dispatchSyncHandler }, { comfortSyncHandler }, { memorySyncHandler }, { replayQueue, watchConnectivity }] =
    await Promise.all([
      import("./db/dispatch-store.js"),
      import("./db/comfort-store.js"),
      import("./db/memory-store.js"),
      import("./db/sync-queue.js"),
    ]);
  const handlers = { dispatch: dispatchSyncHandler, comfort: comfortSyncHandler, memory: memorySyncHandler };
  const runReplay = () => replayQueue(handlers).catch(() => {});
  runReplay(); // in case anything was queued last session and we're already online
  watchConnectivity(runReplay);
}

export async function bootPage({ skipDisclaimerGate = false } = {}) {
  applyAccessibilityPreferences();
  renderBottomNav();
  registerServiceWorker();
  watchAuthState();
  // The disclaimer gate only reads local storage, so it resolves immediately; a page's own
  // interactivity (button wiring, etc.) must never wait on the network. ensureSession() and
  // wireSyncQueue() are deliberately NOT awaited here — they resolve in the background, and
  // anything that actually needs the resulting identity (getCurrentIdentity(), in identity.js)
  // awaits it lazily at the point of use instead, per constitution Principle V (offline-first).
  if (!skipDisclaimerGate) await enforceDisclaimerGate();
  ensureSession();
  wireSyncQueue();
}
