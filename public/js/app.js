// Shared boot logic loaded by every page: bottom nav, accessibility preferences, Supabase
// session init, disclaimer gate, and the magic-link confirmation handler.
import { ensureSession, onAuthStateChange, supabase } from "./api-client.js";
import { getProfile } from "./db/profile-store.js";

const NAV_ITEMS = [
  { href: "index.html", label: "Home", icon: "🏠" },
  { href: "comfort.html", label: "Comfort", icon: "🌿" },
  { href: "care.html", label: "Care", icon: "🗓️" },
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
// supabase-js's detectSessionInUrl (on by default) completes the sign-in automatically. We just
// need to react to the resulting auth state change to know a *different* identity just loaded.
function watchAuthState() {
  onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "USER_UPDATED") {
      window.dispatchEvent(new CustomEvent("cc:auth-changed", { detail: { event } }));
    }
  });
}

export async function bootPage({ skipDisclaimerGate = false } = {}) {
  applyAccessibilityPreferences();
  renderBottomNav();
  registerServiceWorker();
  watchAuthState();
  await ensureSession();
  if (!skipDisclaimerGate) await enforceDisclaimerGate();
}

export { supabase };
