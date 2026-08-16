// Factory + validation for Appointment / ChecklistItem, plus the "Next Visit" and "ready for
// your visit" derivations (data-model.md, FR-015, FR-018).

export function validateAppointmentInput({ title, datetime }) {
  const errors = [];
  if (!title || !title.trim()) errors.push("Give this appointment a title.");
  if (!datetime) errors.push("Choose a date and time.");
  return errors;
}

export function createAppointment({ title, type, datetime, location }) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    type: type?.trim() || "",
    datetime,
    location: location?.trim() || null,
    checklist: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createChecklistItem(label) {
  return { id: crypto.randomUUID(), label: label.trim(), completed: false };
}

// The soonest appointment that is still in the future, or null if none is upcoming.
export function deriveNextVisit(appointments, now = new Date()) {
  const upcoming = appointments
    .filter((a) => new Date(a.datetime).getTime() > now.getTime())
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  return upcoming[0] || null;
}

export function daysUntil(datetime, now = new Date()) {
  const diffMs = new Date(datetime).getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

// Unchecked checklist items + unasked questions for the given appointment (FR-018).
export function readyForVisitSummary(appointment, questions) {
  return {
    checklist: (appointment?.checklist || []).filter((item) => !item.completed),
    questions: (questions || []).filter((q) => !q.asked),
  };
}
