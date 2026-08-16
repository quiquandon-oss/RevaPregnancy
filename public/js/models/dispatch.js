// Factory + validation for CravingDispatch (data-model.md). Pure functions, no I/O.

export const CATEGORIES = ["salty", "sweet", "sour", "cold_drink", "fresh_fruit", "specific_snack"];

export const CATEGORY_LABELS = {
  salty: "Salty",
  sweet: "Sweet",
  sour: "Sour",
  cold_drink: "Cold Drink",
  fresh_fruit: "Fresh Fruit",
  specific_snack: "Specific Snack",
};

export const STATUSES = ["requested", "accepted", "on_the_way", "delivered", "cancelled"];

const FORWARD_TRANSITIONS = {
  requested: ["accepted", "cancelled"],
  accepted: ["on_the_way", "cancelled"],
  on_the_way: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return (FORWARD_TRANSITIONS[from] || []).includes(to);
}

export function validateDispatchInput({ category, intensity, fulfiller, assignedMemberId }) {
  const errors = [];
  if (!CATEGORIES.includes(category)) errors.push("Choose a craving category.");
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > 5) {
    errors.push("Pick an intensity from 1 to 5.");
  }
  if (!["self", "support_member"].includes(fulfiller)) errors.push("Choose who this is for.");
  if (fulfiller === "support_member" && !assignedMemberId) {
    errors.push("Choose who you'd like to send this to.");
  }
  return errors;
}

export function createDispatchDraft({ category, itemName, intensity, fulfiller, assignedMemberId }) {
  return {
    category,
    itemName: itemName?.trim() || null,
    intensity,
    fulfiller,
    assignedMemberId: fulfiller === "support_member" ? assignedMemberId : null,
  };
}

export function isActive(dispatch) {
  return !["delivered", "cancelled"].includes(dispatch.status);
}

export function statusLabel(status) {
  return (
    {
      requested: "Requested",
      accepted: "Accepted",
      on_the_way: "On the way",
      delivered: "Delivered",
      cancelled: "Cancelled",
    }[status] || status
  );
}
