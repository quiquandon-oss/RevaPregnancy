import { bootPage } from "../app.js";
import { createProfile, acknowledgeDisclaimer, getProfile } from "../db/profile-store.js";
import { signInWithEmail } from "../api-client.js";

const STEPS = ["welcome", "profile", "invite", "preview", "disclaimer"];

function showStep(name) {
  for (const section of document.querySelectorAll(".onboarding-step")) {
    section.hidden = section.dataset.step !== name;
  }
}

function currentStep() {
  const visible = document.querySelector(".onboarding-step:not([hidden])");
  return visible?.dataset.step || "welcome";
}

function goNext() {
  const index = STEPS.indexOf(currentStep());
  if (index >= 0 && index < STEPS.length - 1) showStep(STEPS[index + 1]);
}

function wireStepButtons() {
  for (const btn of document.querySelectorAll("[data-next]")) {
    btn.addEventListener("click", async () => {
      if (currentStep() === "profile") await saveProfileStep();
      goNext();
    });
  }
  document.querySelector("[data-back]")?.addEventListener("click", () => showStep("welcome"));
  document.getElementById("returning-user-link").addEventListener("click", () => showStep("sign-in"));
  document.getElementById("invite-now").addEventListener("click", () => {
    window.location.href = "support-network.html";
  });
}

async function saveProfileStep() {
  const name = document.getElementById("onboarding-name").value.trim();
  const dueDate = document.getElementById("onboarding-due-date").value || null;
  const weekValue = document.getElementById("onboarding-week").value;
  const currentWeek = weekValue ? Number(weekValue) : null;
  const existing = await getProfile();
  if (!existing) {
    await createProfile({ name, dueDate, currentWeek });
  } else {
    existing.name = name;
    existing.dueDate = dueDate;
    existing.currentWeek = currentWeek;
    const { saveProfile } = await import("../db/profile-store.js");
    await saveProfile(existing);
  }
}

function wireDisclaimer() {
  const checkbox = document.getElementById("disclaimer-checkbox");
  const finishBtn = document.getElementById("finish-onboarding");
  checkbox.addEventListener("change", () => {
    finishBtn.disabled = !checkbox.checked;
  });
  finishBtn.addEventListener("click", async () => {
    let profile = await getProfile();
    if (!profile) profile = await createProfile({ name: "", dueDate: null, currentWeek: null });
    await acknowledgeDisclaimer();
    window.location.href = "index.html";
  });
}

function wireSignIn() {
  document.getElementById("send-sign-in-link").addEventListener("click", async () => {
    const email = document.getElementById("sign-in-email").value.trim();
    const statusEl = document.getElementById("sign-in-status");
    statusEl.hidden = false;
    if (!email) {
      statusEl.textContent = "Enter the email you linked before.";
      return;
    }
    statusEl.textContent = "Sending your link...";
    const { error } = await signInWithEmail(email);
    statusEl.textContent = error
      ? "That didn't quite go through — want to try again in a moment?"
      : "Check your email for a link to continue on this device.";
  });
}

async function main() {
  await bootPage({ skipDisclaimerGate: true });
  wireStepButtons();
  wireDisclaimer();
  wireSignIn();
  showStep("welcome");
}

main();
