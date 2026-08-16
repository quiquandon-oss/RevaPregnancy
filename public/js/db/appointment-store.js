// Local-only store for Appointment and Question (data-model.md) — no server sync involved.

import { getAll, get, put, remove } from "./local-store.js";

export async function listAppointments() {
  const all = await getAll("appointments");
  return all.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
}

export async function getAppointment(id) {
  return get("appointments", id);
}

export async function saveAppointment(appointment) {
  const record = { ...appointment, updatedAt: new Date().toISOString() };
  await put("appointments", record);
  return record;
}

export async function deleteAppointment(id) {
  return remove("appointments", id);
}

export async function listQuestions() {
  const all = await getAll("questions");
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveQuestion(question) {
  await put("questions", question);
  return question;
}

export async function setQuestionAsked(id, asked) {
  const all = await getAll("questions");
  const question = all.find((q) => q.id === id);
  if (!question) return null;
  question.asked = asked;
  await put("questions", question);
  return question;
}
