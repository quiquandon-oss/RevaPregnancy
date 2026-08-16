import { bootPage } from "../app.js";
import { requireEligibleMember, renderPartnerNav } from "../partner-shared.js";
import { CATEGORY_LABELS, CATEGORY_ICONS, validateMemoryInput } from "../models/memory.js";
import { compressImage } from "../lib/image-compress.js";
import { listOwnerMemories, getMemoryPhotoSignedUrl, createMemoryAsSupportMember, uploadMemoryPhoto } from "../api-client.js";

let ownerId = null;
let allMemories = [];

function formatDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderList() {
  const list = document.getElementById("memory-list");
  const empty = document.getElementById("empty-memories");
  empty.hidden = allMemories.length > 0;
  list.innerHTML = "";

  for (const memory of allMemories) {
    const entry = document.createElement("article");
    entry.className = "timeline-entry";
    entry.innerHTML = `
      <div class="timeline-entry__marker">
        <div class="timeline-entry__icon" aria-hidden="true">${CATEGORY_ICONS[memory.category] || "💛"}</div>
        <span class="micro">${formatDate(memory.date)}</span>
      </div>
      <div class="timeline-entry__body card">
        <h3 style="margin-bottom: 4px">${memory.title}</h3>
        ${memory.note ? `<p class="micro">${memory.note}</p>` : ""}
        ${memory.photoUrl ? `<div class="timeline-entry__photo"><img src="${memory.photoUrl}" alt="${memory.title}" /></div>` : ""}
      </div>
    `;
    list.appendChild(entry);
  }
}

// Photos live in a private bucket, so each one needs a fresh signed URL — same approach as
// partner.js used for the old inline Timeline section.
async function refresh() {
  const { data, error } = await listOwnerMemories(ownerId, 50);
  if (error || !data) return;

  allMemories = await Promise.all(
    data.map(async (row) => {
      let photoUrl = null;
      if (row.photo_path) {
        const { data: signed } = await getMemoryPhotoSignedUrl(row.photo_path);
        photoUrl = signed?.signedUrl || null;
      }
      return { date: row.date, title: row.title, category: row.category, note: row.note, photoUrl };
    })
  );
  renderList();
}

function resetForm() {
  document.getElementById("memory-title").value = "";
  document.getElementById("memory-date").value = "";
  document.getElementById("memory-category").value = "photo";
  document.getElementById("memory-note").value = "";
  document.getElementById("memory-photo").value = "";
  document.getElementById("memory-error").hidden = true;
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
      let photoPath = null;
      if (photoFile) {
        const compressed = await compressImage(photoFile);
        photoPath = `${ownerId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await uploadMemoryPhoto(photoPath, compressed);
        if (uploadError) throw uploadError;
      }

      const { error } = await createMemoryAsSupportMember({
        ownerId,
        title: title.trim(),
        date,
        category,
        note: note.trim(),
        photoPath,
      });
      if (error) throw error;

      resetForm();
      card.hidden = true;
      await refresh();
    } catch {
      errorEl.textContent = "That didn't save — check your connection and try again in a moment.";
      errorEl.hidden = false;
    }
  });
}

async function main() {
  await bootPage({ skipDisclaimerGate: true });
  const member = await requireEligibleMember({ requireFullAccess: true });
  if (!member) return; // requireEligibleMember already redirected

  ownerId = member.ownerId;
  renderPartnerNav("partner-timeline.html", true);
  document.getElementById("memory-date").valueAsDate = new Date();
  wireAddForm();
  await refresh();
}

main();
