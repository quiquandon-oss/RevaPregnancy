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

// GitHub Pages project sites (not user/org root sites) serve from a subpath —
// https://quiquandon-oss.github.io/RevaPregnancy/ — but window.location.origin is just the
// host (https://quiquandon-oss.github.io), so using it alone drops the "/RevaPregnancy" segment
// and produces a link that 404s. Deriving the base from the current page's own directory keeps
// this correct wherever the app is actually deployed, without hardcoding the repo name.
export function inviteLink(inviteCode, origin = window.location.origin) {
  const basePath = window.location.pathname.replace(/[^/]*$/, "");
  return `${origin}${basePath}partner.html?invite=${encodeURIComponent(inviteCode)}`;
}

export function isActiveMember(member) {
  return member.status === "accepted";
}
