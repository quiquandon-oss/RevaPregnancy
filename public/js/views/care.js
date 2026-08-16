import { bootPage } from "../app.js";
import { listAppointments, listQuestions, saveQuestion, setQuestionAsked } from "../db/appointment-store.js";
import { deriveNextVisit, daysUntil, readyForVisitSummary } from "../models/appointment.js";
import { createQuestion, validateQuestionInput } from "../models/question.js";

let appointments = [];
let questions = [];

function renderNextVisit() {
  const next = deriveNextVisit(appointments);
  const section = document.getElementById("next-visit-section");
  if (!next) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const days = daysUntil(next.datetime);
  document.getElementById("next-visit-days").textContent = days <= 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
  const when = new Date(next.datetime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  document.getElementById("next-visit-details").textContent = `${next.title}${next.type ? " · " + next.type : ""} — ${when}`;
  document.getElementById("edit-next-visit").href = `appointment-edit.html?id=${next.id}`;

  const checklistEl = document.getElementById("next-visit-checklist");
  checklistEl.innerHTML = "";
  for (const item of next.checklist) {
    const row = document.createElement("div");
    row.className = "checklist-item";
    row.dataset.completed = String(item.completed);
    row.innerHTML = `<span class="checklist-item__check">${item.completed ? "✓" : ""}</span><span class="checklist-item__label">${item.label}</span>`;
    checklistEl.appendChild(row);
  }

  const summary = readyForVisitSummary(next, questions);
  const summaryEl = document.getElementById("ready-summary");
  if (days <= 7) {
    summaryEl.textContent = `Ready for your visit: ${summary.checklist.length} item(s) left, ${summary.questions.length} question(s) to ask.`;
  } else {
    summaryEl.textContent = "";
  }
}

function renderAppointmentList() {
  const list = document.getElementById("appointment-list");
  const empty = document.getElementById("no-appointments");
  list.innerHTML = "";
  empty.hidden = appointments.length > 0;

  for (const appt of appointments) {
    const card = document.createElement("a");
    card.className = "card row-between";
    card.href = `appointment-edit.html?id=${appt.id}`;
    const when = new Date(appt.datetime).toLocaleDateString();
    card.innerHTML = `<span>${appt.title}</span><span class="micro">${when}</span>`;
    list.appendChild(card);
  }
}

function renderQuestions() {
  const list = document.getElementById("question-list");
  list.innerHTML = "";
  for (const q of questions) {
    const row = document.createElement("label");
    row.className = "checklist-item";
    row.innerHTML = `
      <input type="checkbox" ${q.asked ? "checked" : ""} />
      <span style="flex:1; ${q.asked ? "text-decoration: line-through; color: var(--color-neutral-mid);" : ""}">${q.text}</span>
    `;
    row.querySelector("input").addEventListener("change", async (e) => {
      await setQuestionAsked(q.id, e.target.checked);
      questions = await listQuestions();
      renderQuestions();
      renderNextVisit();
    });
    list.appendChild(row);
  }
}

function wireVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const button = document.getElementById("voice-input-question");
  if (!SpeechRecognition) {
    button.hidden = true;
    return;
  }
  button.addEventListener("click", () => {
    const recognizer = new SpeechRecognition();
    recognizer.lang = "en-US";
    recognizer.onresult = (event) => {
      document.getElementById("new-question").value = event.results[0][0].transcript;
    };
    recognizer.start();
  });
}

function wireAddQuestion() {
  document.getElementById("add-question").addEventListener("click", async () => {
    const input = document.getElementById("new-question");
    const errors = validateQuestionInput({ text: input.value });
    if (errors.length) return;
    await saveQuestion(createQuestion(input.value));
    input.value = "";
    questions = await listQuestions();
    renderQuestions();
    renderNextVisit();
  });
}

async function main() {
  await bootPage();
  appointments = await listAppointments();
  questions = await listQuestions();
  renderNextVisit();
  renderAppointmentList();
  renderQuestions();
  wireVoiceInput();
  wireAddQuestion();
}

main();
