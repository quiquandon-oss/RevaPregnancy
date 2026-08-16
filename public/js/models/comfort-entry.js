// Factory + validation for DailyComfortEntry / ComfortStatusEntry (data-model.md).

export const ENERGY_LEVELS = ["low", "moderate", "full"];

export function validateComfortStatusInput({ label }) {
  const errors = [];
  if (!label || !label.trim()) errors.push("Give this a short label.");
  return errors;
}

export function createComfortStatus({ label, source = "custom" }) {
  return {
    id: crypto.randomUUID(),
    label: label.trim(),
    source,
    addressed: false,
    loggedAt: new Date().toISOString(),
  };
}

// Adds a new status to an entry, or updates an existing one by id (e.g. toggling `addressed`).
export function upsertStatusInEntry(entry, statusInput) {
  const statuses = entry.statuses ? [...entry.statuses] : [];
  if (statusInput.id) {
    const index = statuses.findIndex((s) => s.id === statusInput.id);
    if (index >= 0) {
      statuses[index] = { ...statuses[index], ...statusInput };
      return { ...entry, statuses };
    }
  }
  statuses.push(createComfortStatus(statusInput));
  return { ...entry, statuses };
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
