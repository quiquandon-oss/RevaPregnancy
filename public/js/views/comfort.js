import { bootPage } from "../app.js";
import { getEntry, saveEntry } from "../db/comfort-store.js";
import { todayKey, upsertStatusInEntry, validateComfortStatusInput } from "../models/comfort-entry.js";
import { CURATED_STATUSES } from "../data/comfort-statuses.js";

let entry = null;

async function loadEntry() {
  entry = (await getEntry(todayKey())) || { date: todayKey(), energyLevel: null, statuses: [] };
  return entry;
}

function renderEnergy() {
  const group = document.getElementById("energy-group");
  for (const btn of group.querySelectorAll(".segmented__option")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.value === entry.energyLevel));
  }
}

function wireEnergy() {
  document.getElementById("energy-group").addEventListener("click", async (event) => {
    const btn = event.target.closest(".segmented__option");
    if (!btn) return;
    entry = { ...entry, energyLevel: btn.dataset.value };
    entry = await saveEntry(entry);
    renderEnergy();
  });
}

function findLoggedStatus(label) {
  return entry.statuses.find((s) => s.label === label);
}

function renderStatusList() {
  const container = document.getElementById("status-list");
  container.innerHTML = "";

  const allLabels = [
    ...CURATED_STATUSES.map((s) => ({ ...s, source: "curated" })),
    ...entry.statuses.filter((s) => s.source === "custom").map((s) => ({ label: s.label, icon: "💬", suggestions: [], source: "custom" })),
  ];

  for (const item of allLabels) {
    const logged = findLoggedStatus(item.label);
    const row = document.createElement("div");
    row.className = "status-row";
    row.dataset.open = "false";
    row.innerHTML = `
      <button class="status-row__header" type="button">
        <span class="status-row__icon" aria-hidden="true">${item.icon}</span>
        <span style="flex:1; text-align:left">${item.label}</span>
        <span aria-hidden="true">${logged?.addressed ? "✓" : "›"}</span>
      </button>
      <div class="status-row__body">
        ${item.suggestions.map((s) => `<p class="micro">${s}</p>`).join("")}
        <label class="row" style="margin-top: 8px">
          <input type="checkbox" class="mark-addressed" ${logged?.addressed ? "checked" : ""} />
          Mark as addressed
        </label>
      </div>
    `;

    row.querySelector(".status-row__header").addEventListener("click", () => {
      row.dataset.open = row.dataset.open === "true" ? "false" : "true";
    });

    row.querySelector(".mark-addressed").addEventListener("change", async (event) => {
      entry = upsertStatusInEntry(entry, {
        id: logged?.id,
        label: item.label,
        source: item.source,
        addressed: event.target.checked,
      });
      entry = await saveEntry(entry);
      renderStatusList();
    });

    container.appendChild(row);
  }
}

function wireCustomStatus() {
  document.getElementById("add-custom-status").addEventListener("click", async () => {
    const input = document.getElementById("custom-status");
    const label = input.value;
    const errors = validateComfortStatusInput({ label });
    if (errors.length) return;
    entry = upsertStatusInEntry(entry, { label, source: "custom" });
    entry = await saveEntry(entry);
    input.value = "";
    renderStatusList();
  });
}

async function main() {
  await bootPage();
  await loadEntry();
  wireEnergy();
  wireCustomStatus();
  renderEnergy();
  renderStatusList();
}

main();
