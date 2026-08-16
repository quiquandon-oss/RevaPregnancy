// Shared between partner.html (Requests) and partner-timeline.html (Timeline) — the
// support-network member's own two-tab mini-app, mirroring the owner's bottom-nav pattern in
// app.js but for a completely different, smaller set of pages and an eligibility check the
// owner's nav doesn't need (Timeline only shows for full_support_access members).

import { getThisDeviceMemberRowId, refreshThisDeviceMember } from "./db/support-store.js";

// Redirects to partner.html (which owns the invite-acceptance flow) if this device isn't an
// accepted member, or isn't full_support_access when that's required. Returns the member
// record on success, or null (having already redirected) on failure.
export async function requireEligibleMember({ requireFullAccess = false } = {}) {
  if (!getThisDeviceMemberRowId()) {
    window.location.href = "partner.html";
    return null;
  }
  const member = await refreshThisDeviceMember();
  if (!member || member.status !== "accepted") {
    window.location.href = "partner.html";
    return null;
  }
  if (requireFullAccess && member.permissionLevel !== "full_support_access") {
    window.location.href = "partner.html";
    return null;
  }
  return member;
}

export function renderPartnerNav(activeHref, showTimeline) {
  const existing = document.querySelector(".bottom-nav");
  if (existing) existing.remove();

  const items = [{ href: "partner.html", label: "Requests", icon: "🍫" }];
  if (showTimeline) items.push({ href: "partner-timeline.html", label: "Timeline", icon: "📷" });
  if (items.length < 2) return; // a single tab isn't worth a nav bar

  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Primary");
  for (const item of items) {
    const link = document.createElement("a");
    link.className = "bottom-nav__item";
    link.href = item.href;
    link.innerHTML = `<span aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    if (item.href === activeHref) link.setAttribute("aria-current", "page");
    nav.appendChild(link);
  }
  document.body.appendChild(nav);
}
