import { bootPage } from "../app.js";
import { getProfile } from "../db/profile-store.js";
import { refreshOwnerDispatches, getLastDispatch } from "../db/dispatch-store.js";
import { statusLabel, CATEGORY_LABELS } from "../models/dispatch.js";
import { getCurrentIdentity } from "../identity.js";

const POLL_INTERVAL_MS = 20000;
let pollTimer = null;

function greet(name) {
  const hour = new Date().getHours();
  const time = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting-eyebrow").textContent = time;
  document.getElementById("greeting-name").textContent = name ? `Hello, ${name}` : "Hello";
}

function renderLastDispatch(dispatch) {
  const banner = document.getElementById("last-dispatch-banner");
  const emptyState = document.getElementById("empty-state");
  if (!dispatch) {
    banner.hidden = true;
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;
  banner.hidden = false;
  banner.href = `dispatch.html?id=${dispatch.id}`;
  const label = CATEGORY_LABELS[dispatch.category] || dispatch.category;
  const item = dispatch.itemName ? `${dispatch.itemName}` : label;
  document.getElementById("last-dispatch-text").textContent = `Last dispatch: ${item}`;
  const statusEl = document.getElementById("last-dispatch-status");
  statusEl.textContent = statusLabel(dispatch.status);
  statusEl.classList.toggle("status-pill--positive", dispatch.status === "delivered");
}

async function loadAndRender(ownerId) {
  await refreshOwnerDispatches(ownerId);
  const last = await getLastDispatch(ownerId);
  renderLastDispatch(last);
}

function wireCategoryGrid() {
  document.getElementById("category-grid").addEventListener("click", (event) => {
    const card = event.target.closest(".category-card");
    if (!card) return;
    window.location.href = `dispatch.html?category=${card.dataset.category}`;
  });
  document.getElementById("quick-add-custom").addEventListener("click", () => {
    window.location.href = "dispatch.html?category=specific_snack";
  });
}

async function main() {
  await bootPage();
  const profile = await getProfile();
  greet(profile?.name);
  wireCategoryGrid();

  const { ownerId } = await getCurrentIdentity();
  await loadAndRender(ownerId);

  pollTimer = window.setInterval(() => loadAndRender(ownerId), POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadAndRender(ownerId);
  });
  window.addEventListener("beforeunload", () => window.clearInterval(pollTimer));
}

main();
