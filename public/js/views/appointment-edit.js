import { bootPage } from "../app.js";
import { getAppointment, saveAppointment, deleteAppointment } from "../db/appointment-store.js";
import { createAppointment, createChecklistItem, validateAppointmentInput } from "../models/appointment.js";

let appointment = null;
let editingId = null;

function renderChecklist() {
  const container = document.getElementById("checklist-items");
  container.innerHTML = "";
  for (const item of appointment.checklist) {
    const row = document.createElement("div");
    row.className = "checklist-item";
    row.dataset.completed = String(item.completed);
    row.innerHTML = `
      <button type="button" class="checklist-item__check" aria-label="Toggle complete">${item.completed ? "✓" : ""}</button>
      <span class="checklist-item__label" style="flex:1">${item.label}</span>
      <button type="button" class="icon-btn" aria-label="Remove item">✕</button>
    `;
    const [checkBtn, removeBtn] = row.querySelectorAll("button");
    checkBtn.addEventListener("click", () => {
      item.completed = !item.completed;
      renderChecklist();
    });
    removeBtn.addEventListener("click", () => {
      appointment.checklist = appointment.checklist.filter((i) => i.id !== item.id);
      renderChecklist();
    });
    container.appendChild(row);
  }
}

function wireChecklistAdd() {
  document.getElementById("add-checklist-item").addEventListener("click", () => {
    const input = document.getElementById("new-checklist-item");
    if (!input.value.trim()) return;
    appointment.checklist.push(createChecklistItem(input.value));
    input.value = "";
    renderChecklist();
  });
}

function fillForm() {
  document.getElementById("title").value = appointment.title || "";
  document.getElementById("type").value = appointment.type || "";
  document.getElementById("location").value = appointment.location || "";
  if (appointment.datetime) {
    document.getElementById("datetime").value = appointment.datetime.slice(0, 16);
  }
  renderChecklist();
}

async function loadAppointment() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (id) {
    editingId = id;
    appointment = await getAppointment(id);
    document.getElementById("page-title").textContent = "Edit Appointment";
    document.getElementById("delete-appointment").hidden = false;
  } else {
    appointment = createAppointment({ title: "", type: "", datetime: "" });
  }
}

function wireSave() {
  document.getElementById("save-appointment").addEventListener("click", async () => {
    const title = document.getElementById("title").value;
    const type = document.getElementById("type").value;
    const datetimeLocal = document.getElementById("datetime").value;
    const location = document.getElementById("location").value;
    const datetime = datetimeLocal ? new Date(datetimeLocal).toISOString() : "";

    const errorEl = document.getElementById("form-error");
    const errors = validateAppointmentInput({ title, datetime });
    if (errors.length) {
      errorEl.textContent = errors.join(" ");
      errorEl.hidden = false;
      return;
    }

    appointment = { ...appointment, title, type, datetime, location: location || null };
    await saveAppointment(appointment);
    window.location.href = "care.html";
  });
}

function wireDelete() {
  document.getElementById("delete-appointment").addEventListener("click", async () => {
    if (editingId) await deleteAppointment(editingId);
    window.location.href = "care.html";
  });
}

async function main() {
  await bootPage();
  await loadAppointment();
  fillForm();
  wireChecklistAdd();
  wireSave();
  wireDelete();
}

main();
