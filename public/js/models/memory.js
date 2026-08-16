// Factory + validation for Timeline memories — photos, ultrasounds, and milestone notes.
// Local-only (see db/memory-store.js): photos can be large, so these never leave the device.

export const MEMORY_CATEGORIES = ["photo", "ultrasound", "milestone"];

export const CATEGORY_LABELS = {
  photo: "Photo",
  ultrasound: "Ultrasound",
  milestone: "Milestone",
};

export const CATEGORY_ICONS = {
  photo: "📷",
  ultrasound: "🩻",
  milestone: "💛",
};

export function validateMemoryInput({ title, date, category }) {
  const errors = [];
  if (!title || !title.trim()) errors.push("Give this memory a title.");
  if (!date) errors.push("Pick a date for this memory.");
  if (!MEMORY_CATEGORIES.includes(category)) errors.push("Choose a memory type.");
  return errors;
}

export function createMemory({ title, date, category, note, photoDataUrl }) {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    date,
    category,
    note: (note || "").trim(),
    photoDataUrl: photoDataUrl || null,
    createdAt: new Date().toISOString(),
  };
}
