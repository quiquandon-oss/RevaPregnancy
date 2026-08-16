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

- **Decision**: A minimal Cloudflare Worker exposing a handful of REST routes, backed by
  Cloudflare D1 (SQLite), scoped to exactly two entities: `CravingDispatch` and
  `SupportNetworkMember`.
- **Rationale**: These are the only two entities the spec requires to be visible/actionable from
  a second person's device (FR-005, FR-019–022). Workers + D1 are serverless (no server to
  patch or scale), billed per-use, and D1's SQL schema maps directly onto `data-model.md` with no
  ORM needed — keeping the "simple" direction intact on the backend as well as the frontend.
- **Alternatives considered**: Supabase (blueprint's §6.1 recommendation, Postgres + Realtime +
  Auth) — rejected as heavier to provision and operate (a full Postgres instance, auth
  provider, and realtime channel setup) for a backend that only needs two small tables and plain
  polling. Firebase — rejected for similar reasons plus vendor-specific SDK lock-in on the
  frontend, which would reintroduce a dependency we just removed. A traditional
  Node/Express server on a VM — rejected because it adds infrastructure (process management,
  deployment, scaling) the constitution's simplicity principle argues against when a serverless
  function does the same job with less to maintain.

## 3. Cross-device sync mechanism

- **Decision**: Simple polling — the client re-fetches dispatch/support-network state from the
  Worker API on page focus and on a short interval (e.g. every 20-30s) while a relevant screen
  is open, rather than a persistent real-time connection.
- **Rationale**: The spec's success criteria (SC-002, SC-007) require a partner to see and act on
  a dispatch promptly, not instantly/live; polling meets this with plain `fetch()` calls and no
  extra protocol (WebSockets, SSE) or third-party realtime service to run or debug.
- **Alternatives considered**: Supabase Realtime / WebSockets (blueprint §6.1) — deferred as a
  possible post-MVP enhancement; not required by any MVP success criterion and adds a persistent
  connection to manage for marginal benefit at this scale.

## 4. Identifying "who's asking" without a signup flow

- **Decision**: A random, locally-generated device token is created on first use (for the
  primary user) or on invite acceptance (for a support-network member) and stored in
  `localStorage`. It's sent as a header on requests to the Worker API and is how the backend
  recognizes which profile/dispatches a request may read or act on. No password, email
  verification, or session-cookie auth flow exists in the MVP.
- **Rationale**: Directly satisfies FR-020 (support-network members must not need a full account)
  and keeps the primary user's own "auth" equally frictionless, consistent with constitution
  Principle I (low decision fatigue) and V (low-friction core). This is a plain, dependency-free
  mechanism — no Clerk/Auth.js/Supabase Auth needed.
- **Alternatives considered**: Full email/magic-link authentication (blueprint §6.1 suggestion) —
  rejected for the MVP as unnecessary infrastructure; the app only needs to recognize "this
  device is this pregnancy profile" and "this device accepted this specific invite," not manage
  durable multi-device identity or password recovery. Can be layered in later without changing
  the data model.

## 5. Client-side storage mechanism

- **Decision**: `IndexedDB` accessed directly via the native browser API for structured,
  multi-record data (comfort entries, appointments, checklist items, questions, and the local
  cache of dispatch/support-network state); `localStorage` only for small singleton values
  (profile fields, device token, feature flags like the pregnancy-safe-notes toggle).
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

- **Decision**: `node --test` (Node's built-in test runner) + `assert` for the Worker's route
  logic in `server/tests/`; a small hand-rolled browser-based assertion harness (a plain HTML
  page importing the JS modules under test and printing pass/fail) for frontend model and
  local-store logic in `tests/unit/`. `quickstart.md` is the manual, human-run acceptance test
  for full user-story flows across two simulated devices.
- **Rationale**: Both approaches need zero additional dependencies (`node --test` ships with
  Node 20; the browser harness is just HTML+JS), consistent with the "no heavy framework-specific
  test tooling" direction while still giving automatable regression coverage for the logic that
  matters most (status transitions, offline queueing, permission checks).
- **Alternatives considered**: Jest/Vitest — rejected as build/dependency overhead not justified
  at this project's size. Playwright/Cypress end-to-end suites — deferred; valuable later but not
  required to validate the MVP's acceptance scenarios, which `quickstart.md` covers manually.
