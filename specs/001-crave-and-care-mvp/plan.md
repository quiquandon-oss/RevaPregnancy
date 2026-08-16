# Implementation Plan: Crave & Care MVP

**Branch**: `001-crave-and-care-mvp` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-crave-and-care-mvp/spec.md`

## Summary

Deliver the Crave & Care MVP — instant craving dispatch, comfort tracking, an appointment
ledger, support-network invites, and onboarding — as a mobile-first Progressive Web App built
with **plain HTML, CSS, and vanilla JavaScript** (no frontend framework, no build-step
dependency), per explicit product-owner direction to prioritize simplicity. All core logging
(craving dispatch creation, energy/comfort entries, appointment/question data) lives entirely in
the browser (localStorage/IndexedDB) and works fully offline. The one requirement that plain
client-side storage genuinely cannot satisfy — a support-network member seeing and acting on a
dispatch from her own separate device — is served by a small, dependency-free Cloudflare
Worker + D1 (SQLite) API. Everything else stays static files with zero servers.

## Technical Context

**Language/Version**: HTML5, CSS3, JavaScript (ES2022, native browser modules, no transpilation)
for the frontend; JavaScript (Node.js 20 / Cloudflare Workers runtime) for the minimal backend.

**Primary Dependencies**: None for the frontend (no React/Vue/Next.js, no bundler — files are
served as-is). Backend limited to the Cloudflare Workers runtime + D1 (SQLite) binding, both
platform-provided (no npm framework such as Express/Hono required for the handful of routes
needed).

**Storage**: Browser `localStorage` (small profile/settings values) and `IndexedDB` via the
native API (structured, offline-first local data: comfort entries, appointments, questions, and
the user's own cached view of dispatches/support-network state) — no ORM/wrapper library.
Cloudflare D1 (SQLite) is the server-side source of truth only for the two entities that must be
visible across two different people's devices: `CravingDispatch` status and
`SupportNetworkMember` invites/permissions.

**Testing**: `node --test` + the built-in `assert` module for backend Worker route logic; a
small hand-rolled browser test harness (a plain HTML page that runs assertion functions and
reports pass/fail) for client-side model and local-store logic. No framework-specific test
tooling (no Jest/Vitest/Cypress). `quickstart.md` provides the manual end-to-end acceptance
walkthrough for each user story.

**Target Platform**: Mobile-first responsive web, installable as a PWA, on modern evergreen
browsers (Chrome, Safari incl. iOS, Firefox, Edge).

**Project Type**: Web application — static frontend + a deliberately minimal backend API (see
Complexity Tracking below for why the backend exists at all).

**Performance Goals**: First Contentful Paint under 1.5s and interaction-ready under 3s on
mid-range mobile hardware (constitution Technology & Data Constraints).

**Constraints**: Craving dispatch creation and energy/comfort logging MUST succeed fully offline
(FR-009, FR-013); end-to-end craving dispatch interaction MUST stay well under 8 seconds
(SC-001); zero required build/bundle step for the frontend to stay debuggable and simple
(constitution Principle VII).

**Scale/Scope**: Single-user pregnancy profile per install, typically 1-5 support-network
members per user; 5 user stories from the spec; roughly 14 screens/states drawn from the product
blueprint's screen map (Home, Dispatch Detail, Active Dispatch, Comfort Dashboard, Comfort
Detail, Appointment Ledger, Add/Edit Appointment, Question Capture, Profile, Support Network,
Onboarding x3-4 steps, Partner simplified view).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Check | Result |
|---|---|---|
| I. Emotional Safety & Non-Judgmental Tone | Plan makes no UI/copy decisions itself; copy guidelines carry forward unchanged into implementation tasks. | PASS |
| II. Not a Medical Device | Onboarding includes a disclaimer step (FR-024/025); pregnancy-safe notes remain optional/non-blocking (FR-008). No design choice here conflicts. | PASS |
| III. Privacy & Data Stewardship | Local data stays on-device; the only server-held data (dispatch + support-network records) sits in Cloudflare D1, which encrypts data at rest by default. Partner access is per-invite, permissioned, and revocable server-side (FR-021), satisfying the "immediately revocable" requirement in a way pure client storage could not. | PASS |
| IV. Accessibility by Default | Semantic HTML + hand-written CSS imposes no framework constraint on contrast, touch-target size, reduced-motion, or high-contrast support; these are implementation tasks, not blocked by this plan. | PASS |
| V. Offline-First, Low-Friction Core | All core logging (dispatch creation, comfort/energy) is local-first via IndexedDB with a sync queue; a service worker caches the app shell. Only the two cross-device entities require connectivity to *sync*, never to *log*. | PASS |
| VI. Design System Fidelity | Design tokens (colors, spacing, radius, type) are implemented directly as CSS custom properties in `tokens.css` — framework-free by construction. | PASS |
| VII. Simplicity & No Scope Creep | This plan is the simplicity-maximizing option: zero frontend dependencies, and a backend limited to exactly the two entities that need it (see Complexity Tracking). | PASS, with one documented, justified exception (see below) |

No NON-NEGOTIABLE principle (I, II, III) is violated. One deliberate, justified deviation from
"pure static HTML with zero servers" is recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-crave-and-care-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── api.md            # Phase 1 output — the minimal backend's REST contract
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
public/                     # Static frontend — served as-is, no build step
├── index.html               # Home / Instant Craving Dispatch (H-01)
├── dispatch.html             # Dispatch detail form + active status (H-02/H-03)
├── comfort.html               # Comfort Dashboard + detail (C-01/C-02)
├── care.html                   # Appointment Ledger + question capture (A-01/A-03)
├── appointment-edit.html        # Add/Edit Appointment (A-02)
├── profile.html                   # Profile & Preferences (P-01)
├── support-network.html            # Support Network management (P-02)
├── partner.html                     # Simplified partner view (opened via invite link)
├── onboarding.html                   # Onboarding (S-01)
├── manifest.webmanifest
├── service-worker.js
├── css/
│   ├── tokens.css                     # Modern Nurturing design tokens (custom properties)
│   ├── base.css                        # Resets, typography, layout primitives
│   └── components.css                   # Cards, pills, sliders, nav, banners
├── js/
│   ├── app.js                            # Shared boot: nav, disclaimer gate, device token
│   ├── api-client.js                      # Thin fetch wrapper for the backend API
│   ├── db/
│   │   ├── local-store.js                  # IndexedDB wrapper (get/put/query per entity)
│   │   └── sync-queue.js                    # Offline write queue + background sync
│   ├── models/                               # Plain factory/validation functions per entity
│   │   ├── dispatch.js
│   │   ├── comfort-entry.js
│   │   ├── appointment.js
│   │   └── support-member.js
│   └── views/                                 # One small controller module per HTML page
│       ├── home.js
│       ├── dispatch.js
│       ├── comfort.js
│       ├── care.js
│       ├── profile.js
│       ├── support-network.js
│       ├── partner.js
│       └── onboarding.js
└── icons/                                       # PWA icons, favicons

server/                        # Minimal Cloudflare Worker backend (dispatch + invite sync ONLY)
├── src/
│   ├── index.js                 # Worker entry / router
│   ├── routes/
│   │   ├── dispatches.js         # create/list/update-status/cancel
│   │   └── invites.js             # create/accept/list/revoke support-network members
│   └── db/
│       └── schema.sql               # D1 schema for dispatches + support_network_members
├── wrangler.toml
└── tests/
    ├── dispatches.test.js
    └── invites.test.js

tests/
└── unit/                          # Plain-JS tests for client-side models/local-store
    ├── models.test.html            # Hand-rolled assertion harness (open in a browser)
    └── local-store.test.html
```

**Structure Decision**: Web application split into `public/` (the entire frontend — static
files only, deployable to any static host/CDN) and `server/` (the minimal Worker API,
independently deployable). This mirrors the blueprint's "frontend/backend" shape but keeps the
backend intentionally tiny — it owns exactly two tables. `tests/unit/` covers frontend logic;
`server/tests/` covers the Worker routes.

## Complexity Tracking

> Filling this in because Constitution Check flagged one deliberate deviation from a
> zero-backend, pure-static-HTML design.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Adding a minimal server (Cloudflare Worker + D1) instead of a fully static, backend-less app | Spec FR-005 and FR-019–022 require a support-network member to see and act on (accept / mark on the way / mark delivered) a dispatch from her *own separate device*, and for the inviting user to revoke that access *immediately*. Client-only storage (localStorage/IndexedDB) is scoped to one browser on one device and cannot share or reconcile state across two different people's devices. | A fully static app with no server (e.g. encoding all state into the invite link itself, or relying on manual copy/paste of a status code between the two people) cannot deliver live, two-way status updates — which is the entire value of User Story 1's partner-fulfillment path and is directly measured by SC-002 and SC-007. The backend here is scoped to exactly the two entities that need cross-device visibility (`CravingDispatch`, `SupportNetworkMember`); every other entity (comfort entries, appointments, questions, profile) stays fully client-side. |
