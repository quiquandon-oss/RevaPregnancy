# Phase 0 Research: Crave & Care MVP

All items below were resolved directly (no unresolved `NEEDS CLARIFICATION` markers remain in
`plan.md`'s Technical Context) based on the product owner's explicit "simple, plain HTML" steer
and the project constitution.

## 1. Frontend approach: plain HTML/CSS/JS vs. a framework

- **Decision**: Plain HTML5, CSS3, and vanilla JavaScript (native ES modules), no framework, no
  bundler, no build step. Pages are separate `.html` files sharing common CSS/JS modules.
- **Rationale**: Explicit product-owner direction to prioritize simplicity; matches constitution
  Principle VII (Simplicity & No Scope Creep) and the blueprint's own §6.4 "static HTML/CSS
  foundations" fallback. Zero dependencies means zero framework upgrades, zero build-tool
  breakage, and the entire app is readable/debuggable by opening a file in a browser.
- **Alternatives considered**: React/Next.js (the blueprint's primary §6.1 recommendation) —
  rejected because it requires a build pipeline, routing library, and state-management choice
  the MVP's scope (≈14 screens, no complex client state graph) does not need. Svelte/Vue —
  rejected for the same build-step reason; still a dependency to maintain.

## 2. Backend: how to satisfy cross-device partner sync without a heavy stack

- **Decision**: Supabase (hosted Postgres), used for three tables — `dispatches`,
  `support_network_members`, and `comfort_entries` — accessed through Supabase's auto-generated
  REST API and Row Level Security (RLS) policies, with no hand-written server route handlers at
  all. The only "backend code" is SQL: the schema, the RLS policies, one trigger that enforces the
  dispatch status state machine, and one RPC function (`accept_invite`) for atomically claiming an
  invite.
- **Rationale**: Product owner explicitly asked not to use Cloudflare, and independently confirmed
  Supabase as the preferred option (it was also the blueprint's own §6.1 recommendation). Because
  Supabase generates the REST API directly from the Postgres schema, this backend requires *zero*
  custom application code to write or maintain — arguably simpler than a hand-rolled Cloudflare
  Worker with route handlers. It's scoped to exactly the entities that need it: two for
  cross-person visibility (FR-005, FR-019–022) and one (`comfort_entries`) for the product owner's
  cross-device-backup requirement (FR-013, FR-031) — see item 8 below.
- **Alternatives considered**: Cloudflare Workers + D1 — ruled out per explicit product-owner
  direction (no Cloudflare). Firebase/Firestore — rejected for a proprietary SDK and query model
  that's a bigger frontend dependency than a thin REST client, plus less natural fit for the
  relational status-transition rules in `data-model.md`. A traditional Node/Express server on a
  VM — rejected because it adds infrastructure (process management, deployment, scaling) the
  constitution's simplicity principle argues against when a managed database with generated APIs
  does the same job with nothing to operate.

## 3. Cross-device sync mechanism

- **Decision**: Simple polling — the client re-fetches dispatch/support-network state from
  Supabase on page focus and on a short interval (e.g. every 20-30s) while a relevant screen is
  open, rather than subscribing to Supabase Realtime.
- **Rationale**: The spec's success criteria (SC-002, SC-007) require a partner to see and act on
  a dispatch promptly, not instantly/live; polling meets this with plain `select()` calls via
  `supabase-js` and avoids adding a persistent Realtime subscription to reason about for the MVP.
- **Alternatives considered**: Supabase Realtime (built into the platform we're already using,
  so it would cost little to add) — deferred as a natural post-MVP upgrade rather than adopted now,
  since no MVP success criterion requires live/instant updates and polling is simpler to reason
  about and debug.

## 4. Identifying "who's asking" without a signup flow

- **Decision**: Supabase Anonymous Auth. Each device — the primary user's on first use, and a
  support-network member's on invite acceptance — gets a real (but passwordless, emailless)
  Supabase auth session, persisted locally by `supabase-js` itself. Row Level Security policies
  key off `auth.uid()` to decide what each session may read or change. No custom token scheme,
  header, or session store of our own.
- **Rationale**: Directly satisfies FR-020 (support-network members must not need a full account)
  and keeps the primary user's own "auth" equally frictionless, consistent with constitution
  Principle I (low decision fatigue) and V (low-friction core). Using Supabase's built-in
  anonymous-auth feature (rather than hand-rolling a device-token header) means authorization is
  enforced by Postgres itself via RLS — one less thing for us to implement and get wrong.
- **Alternatives considered**: A hand-rolled device-token header (our original Cloudflare-era
  design) — superseded now that Supabase is the backend, since anonymous auth gives the same
  "no signup" outcome while letting RLS do the authorization instead of custom validation code.
  Requiring full email/password authentication up front (blueprint §6.1 suggestion) — rejected as
  unnecessary friction for every user's first run; instead, email linking is offered as a purely
  optional, later upgrade (FR-031) — see item 8 below — which is exactly the "layer it in later
  without changing the data model" path this decision anticipated.

## 5. Client-side storage mechanism

- **Decision**: `IndexedDB` accessed directly via the native browser API for structured,
  multi-record data — this covers both entities that are purely local (appointments, checklist
  items, questions) and the local read-cache/offline-write-queue for the three Supabase-synced
  entities (dispatches, support-network members, comfort entries); `localStorage` only for small
  singleton values (profile fields, feature flags like the pregnancy-safe-notes toggle) — the
  Supabase auth session itself is persisted by `supabase-js`'s own storage, not something we
  manage by hand.
- **Rationale**: IndexedDB natively supports the queryable, list-shaped data this app needs
  (e.g. "all comfort entries for today," "all unasked questions") without an ORM. Using the
  native API instead of a wrapper (e.g. Dexie, as the blueprint suggested in §6.1) keeps the
  dependency count at zero, matching the simplicity direction.
- **Alternatives considered**: Dexie.js — rejected as an avoidable dependency; its ergonomic
  benefits aren't necessary at this data complexity. A single large `localStorage` JSON blob —
  rejected as it doesn't scale well to querying/filtering (e.g. "unasked questions across all
  appointments") and risks losing data on a corrupt write with no per-record granularity.

## 6. Offline support / PWA mechanics

- **Decision**: A hand-written `manifest.webmanifest` and a hand-written `service-worker.js`
  using the Cache API to serve the app shell offline, plus the IndexedDB-backed sync queue
  (from research item 5) to hold writes made while offline until connectivity returns.
- **Rationale**: A service worker needs no framework; writing ~50-100 lines directly avoids
  pulling in Workbox, keeping the zero-dependency frontend promise intact.
- **Alternatives considered**: Workbox — rejected as unneeded tooling for the modest number of
  routes/assets this MVP caches; can be reconsidered if the caching strategy grows materially
  more complex post-MVP.

## 7. Testing approach

- **Decision**: `node --test` (Node's built-in test runner) + `assert`, run against a local
  Supabase instance (`supabase start`), for RLS-policy and status-transition-trigger behavior in
  `supabase/tests/`; a small hand-rolled browser-based assertion harness (a plain HTML page
  importing the JS modules under test and printing pass/fail) for frontend model and local-store
  logic in `tests/unit/`. `quickstart.md` is the manual, human-run acceptance test for full
  user-story flows across two simulated devices.
- **Rationale**: Both approaches need zero additional dependencies beyond the (already-required)
  Supabase CLI for local dev (`node --test` ships with Node 20; the browser harness is just
  HTML+JS), consistent with the "no heavy framework-specific test tooling" direction while still
  giving automatable regression coverage for the logic that matters most (status transitions,
  offline queueing, permission checks).
- **Alternatives considered**: Jest/Vitest — rejected as build/dependency overhead not justified
  at this project's size. Playwright/Cypress end-to-end suites — deferred; valuable later but not
  required to validate the MVP's acceptance scenarios, which `quickstart.md` covers manually.

## 8. Letting the primary user resume her profile on a second device (FR-031)

- **Decision**: Comfort/energy entries move from local-only to Supabase-synced (item 2 above), and
  the primary user's Supabase Auth session can be optionally upgraded from anonymous to
  email-linked via `supabase.auth.updateUser({ email })`, triggered only when she chooses "back up
  my account" in Profile. Supabase sends a confirmation link to that email; once confirmed, the
  same email can be used with `supabase.auth.signInWithOtp({ email })` on any device to sign back
  into the *same* `auth.uid()` — and therefore the same dispatches, support-network members, and
  comfort history.
- **Rationale**: Product owner confirmed she wants comfort/energy data to survive device loss and
  be reachable from a second device, not just "backed up" invisibly. Since the app's whole
  low-friction premise depends on zero signup by default (constitution Principle I, V), the fix is
  to keep anonymous auth as the default and offer email-linking as a deliberate, optional, later
  step — never shown during onboarding, never required to use any feature (FR-031). This reuses
  the exact "layer it in later" path research item 4 already anticipated, so it doesn't change the
  data model — it only adds two nullable fields to the local `User` profile
  (`linkedEmail`/`emailLinkedAt`) to reflect link status in the UI.
- **Alternatives considered**: Requiring email up front for every user — rejected as directly
  contradicting the low-friction, no-signup positioning that's core to the product (and to
  support-network members' own onboarding, FR-020). A custom password-based account system —
  rejected as unnecessary; Supabase's passwordless email-link flow gives the same "resume my
  profile elsewhere" outcome with less to build and nothing for the user to forget.
