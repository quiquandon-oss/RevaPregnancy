<!--
Sync Impact Report
- Version change: (none, template) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections:
  - Core Principles: I. Emotional Safety & Non-Judgmental Tone, II. Not a Medical Device,
    III. Privacy & Data Stewardship, IV. Accessibility by Default,
    V. Offline-First, Low-Friction Core, VI. Design System Fidelity ("Modern Nurturing"),
    VII. Simplicity & No Scope Creep
  - Spec-Driven Workflow (Section 2)
  - Technology & Data Constraints (Section 3)
  - Governance
- Removed sections: none (template placeholders replaced)
- Deferred items: none
- Templates requiring follow-up: none — plan/spec/tasks templates already reference
  "Constitution Check" generically and do not embed principle names.
-->

# Crave & Care Constitution

## Core Principles

### I. Emotional Safety & Non-Judgmental Tone (NON-NEGOTIABLE)
All user-facing copy, notifications, and error states MUST use a warm, respectful, concise
voice. Copy MUST NOT be clinical, alarmist, or shaming. Directive words ("should", "must",
"avoid") MUST NOT appear in user-facing text; prefer soft, inviting phrasing ("Would you
like…", "Here's a gentle idea…", "When you're ready…"). When a feature could plausibly
increase decision fatigue (e.g. more fields, more choices, more required steps), the design
MUST favor the lower-friction option over the more "complete" one, even if that means
deferring optional detail to a later, dismissible step.
Rationale: the product's entire value proposition is emotional safety and reduced friction
during pregnancy; a single judgmental or clinical-sounding interaction undermines user trust
more than a missing feature does.

### II. Not a Medical Device (NON-NEGOTIABLE)
The application MUST NOT diagnose, triage, or assign rigid nutrition/health scores. It MUST
NOT present itself, in any copy or UI treatment, as a source of medical advice. Pregnancy-safety
notes (e.g. "choose pasteurised soft cheeses") are OPTIONAL, off by default or clearly
togglable, short, evidence-based, and MUST NEVER block, gate, or shame a logged craving or
action. A persistent, non-intrusive medical disclaimer MUST be visible on first run and
reachable thereafter (e.g. in Profile/Settings), stating the app is not a medical device and
does not replace professional care.
Rationale: crossing into medical-advice territory creates regulatory risk and, more importantly,
breaks the calm, non-judgmental relationship the app is built on.

### III. Privacy & Data Stewardship (NON-NEGOTIABLE)
Health-adjacent data — craving logs, energy/comfort entries, appointment details, and free-text
notes/questions — MUST be encrypted at rest. This data MUST NOT be sold or shared with third
parties for advertising or data-broker purposes. Any access granted to a partner or support-network
member MUST be explicit (opt-in per person), scoped to specific permissions (e.g. "can receive
dispatches" vs. "can view comfort history"), and revocable by the user at any time with immediate
effect.
Rationale: this data is intimate and health-adjacent; trust is the product's core asset and is
irrecoverable once broken.

### IV. Accessibility by Default
All text/icon/background combinations MUST meet WCAG 2.1 AA contrast. Interactive touch targets
MUST be at least 48px. The app MUST offer a reduced-motion mode and a high-contrast mode, and
MUST support voice input for custom craving entries and free-text questions. Accessibility is a
default state of every screen, not a post-hoc audit item.
Rationale: pregnancy involves fluctuating energy, vision, and motor comfort; accessibility here is
core usability, not a compliance checkbox.

### V. Offline-First, Low-Friction Core
Craving logging, energy/comfort status updates, and dispatch creation MUST work fully offline,
queuing locally (e.g. IndexedDB) and syncing automatically when connectivity returns. The
end-to-end interaction of logging a craving (open app → select category → confirm) MUST be
achievable in well under the product's 8-second target; any change that measurably slows this
path MUST be justified against that target before merging.
Rationale: cravings and comfort needs are time-sensitive and often occur in low-connectivity
moments (car, store, bed); friction or connectivity dependence directly defeats the product's
purpose.

### VI. Design System Fidelity ("Modern Nurturing")
All UI MUST be implemented using the documented "Modern Nurturing" design tokens — the sage
green / dusty rose / warm off-white color palette, serif display + humanist sans body
typography, 4px spacing scale, soft rounded cards (20–24px radius), pill-shaped buttons, and
line-weight iconography — rather than default component-library styling. New components MUST be
built or themed to match these tokens before being considered complete.
Rationale: the calm, nurturing feel is a deliberate design decision central to the brand; generic
UI undermines the emotional-safety positioning as much as harsh copy would.

### VII. Simplicity & No Scope Creep
Features MUST avoid rigid scoring systems, medical-grade logic, or premature abstractions.
Each implementation phase MUST build only what the current milestone requires (per the phased
MVP plan: Foundation → Core Logic → Partnership & Sync → Polish/PWA) and MUST NOT anticipate
future phases with speculative infrastructure. When a simpler implementation and a more general
one both satisfy the current spec, the simpler one MUST be chosen.
Rationale: scope discipline is what keeps the product calm and fast rather than cluttered; it
also keeps a small team/agent able to ship reliably.

## Spec-Driven Workflow

This project is developed using GitHub Spec Kit. Every feature MUST proceed through
specification (`/speckit.specify`), planning (`/speckit.plan`), task breakdown
(`/speckit.tasks`), and — for any non-trivial feature — cross-artifact analysis
(`/speckit.analyze`) before implementation (`/speckit.implement`) begins. Specs and plans MUST be
checked against this constitution; any principle violation MUST be called out explicitly in the
plan's "Constitution Check" section with a documented justification, or the design MUST be
revised to comply. Implementation MUST NOT begin until the human product owner has explicitly
approved the plan and tasks for that feature.

## Technology & Data Constraints

- **Platform**: Progressive Web App, mobile-first responsive, installable, with full offline
  support. Native wrappers are out of scope unless explicitly re-specified later.
- **Core entities**: User, PartnerLink, CravingDispatch, DailyComfort, Appointment — as the
  minimum shape; fields may be extended but MUST NOT be redefined in ways that break the
  privacy and revocability guarantees in Principle III.
- **Performance**: First Contentful Paint MUST target under 1.5s and interaction-ready under 3s
  on mid-range mobile hardware.
- **Internationalization**: English-first, but data models and copy MUST NOT hard-code
  assumptions (date formats, string concatenation) that would block future localization.

## Governance

This constitution supersedes any conflicting ad-hoc practice, template default, or prior
convention. All specs, plans, and task lists MUST be checked for compliance before
implementation; any deviation requires written rationale in the relevant plan document.

**Amendment procedure**: Amendments are proposed by editing this file, MUST state the nature of
the change, and MUST bump the version per the policy below. Amendments take effect immediately
upon commit; dependent specs/plans SHOULD be re-checked against the amended principles at the
next `/speckit.analyze` run for that feature.

**Versioning policy** (semantic):
- MAJOR: backward-incompatible removal or redefinition of a principle.
- MINOR: a new principle or materially expanded section is added.
- PATCH: wording clarifications or non-semantic fixes.

**Compliance review**: Every `/speckit.plan` run MUST include an explicit Constitution Check
against the principles above. Reviewers (human or agent) MUST reject a plan that violates a
NON-NEGOTIABLE principle (I, II, III) without a documented, product-owner-approved exception.

**Version**: 1.0.0 | **Ratified**: 2026-08-15 | **Last Amended**: 2026-08-15
