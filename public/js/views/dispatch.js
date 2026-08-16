import { bootPage } from "../app.js";
import { getCurrentIdentity } from "../identity.js";
import { getProfile, updateProfile } from "../db/profile-store.js";
import {
  createDispatch,
  updateStatus,
  getRecentItemNames,
  refreshOwnerDispatches,
  refreshAssigneeDispatches,
  getCachedDispatches,
} from "../db/dispatch-store.js";
import { CATEGORY_LABELS, statusLabel, isActive } from "../models/dispatch.js";
import { listAcceptedSupportMembers } from "../db/support-store.js";

const PREGNANCY_SAFE_NOTES = {
  soft_cheese: "Soft cheeses: pasteurised is the gentler choice.",
  deli_meat: "Deli meats: warming through can offer extra peace of mind.",
  raw_fish: "Raw fish: fully cooked is the gentler choice while pregnant.",
};

function params() {
  return new URLSearchParams(window.location.search);
}

let selectedIntensity = 3;
let selectedCategory = null;
let ownerId = null;

function wireIntensitySelector() {
  const group = document.getElementById("intensity-group");
  group.addEventListener("click", (event) => {
    const btn = event.target.closest(".segmented__option");
    if (!btn) return;
    selectedIntensity = Number(btn.dataset.value);
    for (const el of group.querySelectorAll(".segmented__option")) {
      el.setAttribute("aria-pressed", String(el === btn));
    }
  });
}

async function populateFulfillerOptions(defaultFulfillerId) {
  const select = document.getElementById("fulfiller");
  const members = await listAcceptedSupportMembers().catch(() => []);
  for (const member of members) {
    const option = document.createElement("option");
    option.value = member.id;
    option.textContent = member.displayName || "Support person";
    select.appendChild(option);
  }
  // Set from Profile > "Send craving requests to" (defaults to "Just for me" if unset, or if
  // the previously-chosen person was revoked since — the option simply won't exist anymore).
  if (defaultFulfillerId) select.value = defaultFulfillerId;
}

async function populateSuggestions(category) {
  const names = await getRecentItemNames(category);
  const container = document.getElementById("suggestions");
  container.innerHTML = "";
  for (const name of names) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "btn btn-outline";
    chip.style.padding = "4px 12px";
    chip.style.minHeight = "auto";
    chip.textContent = name;
    chip.addEventListener("click", () => {
      document.getElementById("item-name").value = name;
    });
    container.appendChild(chip);
  }
}

function maybeShowSafeNote(itemName) {
  const notesEnabled = document.body.dataset.safeNotesEnabled === "true";
  const notesEl = document.getElementById("safe-notes");
  if (!notesEnabled || !itemName) {
    notesEl.hidden = true;
    return;
  }
  const lower = itemName.toLowerCase();
  const match = Object.entries(PREGNANCY_SAFE_NOTES).find(([key]) => lower.includes(key.replace("_", " ")));
  if (match) {
    document.getElementById("safe-notes-text").textContent = match[1];
    notesEl.hidden = false;
  } else {
    notesEl.hidden = true;
  }
}

function wireVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById("voice-input-item");
  if (!SpeechRecognition) {
    button.hidden = true;
    return;
  }
  button.addEventListener("click", () => {
    const recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.onresult = (event) => {
      document.getElementById("item-name").value = event.results[0][0].transcript;
      maybeShowSafeNote(document.getElementById("item-name").value);
    };
    recognizer.start();
  });
}

async function initForm(category) {
  selectedCategory = category;
  document.getElementById("dispatch-form-section").hidden = false;
  document.getElementById("form-title").textContent = `${CATEGORY_LABELS[category] || "Craving"}?`;
  document.getElementById("item-name").addEventListener("input", (e) => maybeShowSafeNote(e.target.value));

  const profile = await getProfile();
  document.body.dataset.safeNotesEnabled = String(!!profile?.pregnancySafeNotesEnabled);

  wireIntensitySelector();
  wireVoiceInput();
  await populateFulfillerOptions(profile?.defaultFulfillerId);
  await populateSuggestions(category);

  document.getElementById("send-dispatch").addEventListener("click", async () => {
    const itemName = document.getElementById("item-name").value;
    const fulfillerValue = document.getElementById("fulfiller").value;
    const fulfiller = fulfillerValue === "self" ? "self" : "support_member";
    const assignedMemberId = fulfiller === "support_member" ? fulfillerValue : null;

    const errorEl = document.getElementById("form-error");
    errorEl.hidden = true;

    const dispatch = await createDispatch(
      { category: selectedCategory, itemName, intensity: selectedIntensity, fulfiller, assignedMemberId },
      ownerId
    );
    window.location.href = `dispatch.html?id=${dispatch.id}`;
  });
}

function renderTimeline(dispatch) {
  const steps = dispatch.fulfiller === "self" ? ["delivered"] : ["requested", "accepted", "on_the_way", "delivered"];
  const list = document.getElementById("status-timeline");
  list.innerHTML = "";
  for (const step of steps) {
    const li = document.createElement("li");
    const reached =
      steps.indexOf(step) <= steps.indexOf(dispatch.status) || dispatch.status === "cancelled" ? false : false;
    const isCurrent = dispatch.status === step;
    const isPast = steps.indexOf(step) < steps.indexOf(dispatch.status);
    li.className = "row";
    li.innerHTML = `<span class="status-pill ${isCurrent || isPast ? "status-pill--positive" : ""}">${statusLabel(
      step
    )}</span>`;
    list.appendChild(li);
  }
  if (dispatch.status === "cancelled") {
    const li = document.createElement("li");
    li.innerHTML = `<span class="status-pill">Cancelled</span>`;
    list.appendChild(li);
  }
}

async function refreshStatusView(dispatchId) {
  const all = await getCachedDispatches();
  const dispatch = all.find((d) => d.id === dispatchId);
  if (!dispatch) return null;
  document.getElementById("status-category").textContent = CATEGORY_LABELS[dispatch.category] || dispatch.category;
  document.getElementById("status-item-name").textContent = dispatch.itemName || "";
  document.getElementById("status-pill").textContent = statusLabel(dispatch.status);
  renderTimeline(dispatch);
  document.getElementById("cancel-dispatch").hidden = !isActive(dispatch) || dispatch.fulfiller === "self";
  return dispatch;
}

async function initStatus(dispatchId) {
  document.getElementById("status-section").hidden = false;
  await refreshOwnerDispatches(ownerId);
  let dispatch = await refreshStatusView(dispatchId);

  const poll = window.setInterval(async () => {
    await refreshOwnerDispatches(ownerId);
    dispatch = await refreshStatusView(dispatchId);
    if (dispatch && !isActive(dispatch)) window.clearInterval(poll);
  }, 20000);

  document.getElementById("cancel-dispatch").addEventListener("click", async () => {
    await updateStatus(dispatchId, "cancelled");
    await refreshStatusView(dispatchId);
  });
}

async function main() {
  await bootPage();
  const identity = await getCurrentIdentity();
  ownerId = identity.ownerId;

  const p = params();
  const category = p.get("category");
  const id = p.get("id");

  if (id) {
    await initStatus(id);
  } else if (category) {
    await initForm(category);
  } else {
    window.location.href = "index.html";
  }
}

main();
