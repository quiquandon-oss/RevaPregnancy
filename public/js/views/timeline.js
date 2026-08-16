import { bootPage } from "../app.js";
import { listMemories, saveMemory, deleteMemory } from "../db/memory-store.js";
import { createMemory, validateMemoryInput, CATEGORY_LABELS, CATEGORY_ICONS } from "../models/memory.js";

let allMemories = [];
let activeFilter = "all";

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderList() {
  const list = document.getElementById("memory-list");
  const empty = document.getElementById("empty-memories");
  const visible = activeFilter === "all" ? allMemories : allMemories.filter((m) => m.category === activeFilter);

  empty.hidden = visible.length > 0;
  list.innerHTML = "";

  for (const memory of visible) {
    const entry = document.createElement("article");
    entry.className = "timeline-entry";
    entry.innerHTML = `
      <div class="timeline-entry__marker">
        <div class="timeline-entry__icon" aria-hidden="true">${CATEGORY_ICONS[memory.category]}</div>
        <span class="micro">${formatDate(memory.date)}</span>
      </div>
      <div class="timeline-entry__body card">
        <div class="row-between">
          <h3 style="margin-bottom: 4px">${memory.title}</h3>
          <button type="button" class="icon-btn" aria-label="Remove this memory">✕</button>
        </div>
        ${memory.note ? `<p class="micro">${memory.note}</p>` : ""}
        ${memory.photoDataUrl ? `<div class="timeline-entry__photo"><img src="${memory.photoDataUrl}" alt="${memory.title}" /></div>` : ""}
      </div>
    `;
    entry.querySelector(".icon-btn").addEventListener("click", async () => {
      await deleteMemory(memory.id);
      allMemories = allMemories.filter((m) => m.id !== memory.id);
      renderList();
    });
    list.appendChild(entry);
  }
}

async function refresh() {
  allMemories = await listMemories();
  renderList();
}

function wireFilters() {
  const chips = document.querySelectorAll("#filter-chips .chip");
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      activeFilter = chip.dataset.filter;
      for (const other of chips) other.setAttribute("aria-pressed", String(other === chip));
      renderList();
    });
  }
}

function resetForm() {
  document.getElementById("memory-title").value = "";
  document.getElementById("memory-date").value = "";
  document.getElementById("memory-category").value = "photo";
  document.getElementById("memory-note").value = "";
  document.getElementById("memory-photo").value = "";
  document.getElementById("memory-error").hidden = true;
}

function readPhotoAsDataUrl(file) {
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function wireAddForm() {
  const card = document.getElementById("add-memory-card");
  document.getElementById("add-memory-toggle").addEventListener("click", () => {
    card.hidden = !card.hidden;
  });

  document.getElementById("save-memory").addEventListener("click", async () => {
    const title = document.getElementById("memory-title").value;
    const date = document.getElementById("memory-date").value;
    const category = document.getElementById("memory-category").value;
    const note = document.getElementById("memory-note").value;
    const photoFile = document.getElementById("memory-photo").files[0];

    const errorEl = document.getElementById("memory-error");
    const errors = validateMemoryInput({ title, date, category });
    if (errors.length) {
      errorEl.textContent = errors.join(" ");
      errorEl.hidden = false;
      return;
    }

    try {
      const photoDataUrl = await readPhotoAsDataUrl(photoFile);
      const memory = createMemory({ title, date, category, note, photoDataUrl });
      await saveMemory(memory);
      allMemories = [memory, ...allMemories];
      resetForm();
      card.hidden = true;
      renderList();
    } catch {
      errorEl.textContent = "That photo couldn't be saved — try a smaller image or skip it for now.";
      errorEl.hidden = false;
    }
  });
}

async function main() {
  await bootPage();
  document.getElementById("memory-date").valueAsDate = new Date();
  wireFilters();
  wireAddForm();
  await refresh();
}

main();
