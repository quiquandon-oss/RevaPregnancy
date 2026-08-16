// Factory + validation for SupportNetworkMember (data-model.md).

export const PERMISSION_LEVELS = ["dispatch_recipient", "full_support_access"];

export const PERMISSION_LABELS = {
  dispatch_recipient: "Can receive craving dispatches",
  full_support_access: "Full support access",
};

export function validateInviteInput({ permissionLevel }) {
  const errors = [];
  if (!PERMISSION_LEVELS.includes(permissionLevel)) errors.push("Choose a permission level.");
  return errors;
}

export function inviteLink(inviteCode, origin = window.location.origin) {
  return `${origin}/partner.html?invite=${encodeURIComponent(inviteCode)}`;
}

export function isActiveMember(member) {
  return member.status === "accepted";
}
