---

description: "Task list for Crave & Care MVP implementation"
---

# Tasks: Crave & Care MVP

**Input**: Design documents from `/specs/001-crave-and-care-mvp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md
(all present)

**Tests**: A modest set of test tasks is included because plan.md's Project Structure already
names specific test artifacts (`tests/unit/models.test.html`, `tests/unit/local-store.test.html`,
`supabase/tests/rls-and-transitions.test.js`) as required deliverables — not a full TDD suite,
but targeted coverage of the logic most likely to break silently (status transitions, RLS access
control, offline queueing).

**Organization**: Tasks are grouped by user story (from spec.md) so each story can be built,
tested, and demoed independently, per the spec's own "Independent Test" requirement for each
story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps the task to US1-US5 from spec.md
- File paths below follow plan.md's Project Structure exactly

---

## Phase 1: Setup

**Purpose**: Repository scaffolding shared by every later phase.

- [ ] T001 Create the directory structure from plan.md's Project Structure: `public/css/`,
      `public/js/db/`, `public/js/models/`, `public/js/views/`, `public/icons/`, `supabase/migrations/`,
      `supabase/tests/`, `tests/unit/`
- [ ] T002 [P] Run `supabase init` to create `supabase/config.toml` for local development (per
      quickstart.md §2)
- [ ] T003 [P] Create `public/css/tokens.css` with the "Modern Nurturing" design tokens as CSS
      custom properties: color palette, type scale, spacing unit (4px), radii, shadow, from the
      product blueprint §2
- [ ] T004 [P] Create `public/manifest.webmanifest` (app name, theme/background colors from
      tokens, icon references) and placeholder PWA icons in `public/icons/`
- [ ] T005 [P] Add `.editorconfig` and a minimal flat-config ESLint setup (no bundler) covering
      `public/js/**` and `supabase/**/*.js` for consistent style with zero build step

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story depends on. **No user story work starts before this
phase is complete.**

- [ ] T006 Write `supabase/migrations/0001_init.sql`: create the `dispatches` and
      `support_network_members` tables with the fields, enums, and foreign keys from
      data-model.md; enable Row Level Security on both
- [ ] T007 In `supabase/migrations/0001_init.sql`, add RLS policies for `dispatches` (owner can
      insert/select/cancel; assigned member can select/advance status) per contracts/api.md
      (depends on T006)
- [ ] T008 In `supabase/migrations/0001_init.sql`, add RLS policies for
      `support_network_members` (owner can insert/select/update; invitee can read only their own
      invite by code) per contracts/api.md (depends on T006)
- [ ] T009 In `supabase/migrations/0001_init.sql`, add the `BEFORE UPDATE` trigger enforcing the
      `dispatches.status` state machine from data-model.md (rejects any transition outside
      `requested→accepted→on_the_way→delivered`, `requested/accepted→cancelled`) (depends on
      T006)
- [ ] T010 In `supabase/migrations/0001_init.sql`, add the `accept_invite(invite_code,
      display_name)` `SECURITY DEFINER` RPC function that atomically stamps
      `member_auth_id = auth.uid()` per contracts/api.md (depends on T006)
- [ ] T011 [P] Create `public/js/db/local-store.js`: a native-IndexedDB wrapper opening the app
      database and exposing generic `get`/`put`/`delete`/`queryByIndex` helpers, used by every
      client-only entity
- [ ] T012 [P] Create `public/js/db/sync-queue.js`: an offline write-queue skeleton (enqueue a
      pending Supabase write, replay queued writes on `online` events and on page load) used by
      the two server-synced entities
- [ ] T013 [P] Create `public/js/api-client.js`: import `supabase-js` as an ES module (CDN, no
      build step), initialize the client, and implement the session bootstrap from
      contracts/api.md (`getSession()` → `signInAnonymously()` if absent)
- [ ] T014 [P] Create `public/css/base.css` (resets, typography, layout primitives) and
      `public/css/components.css` (cards, pill buttons, segmented slider, bottom nav, status
      banner) built on `tokens.css` custom properties
- [ ] T015 [P] Create `public/js/app.js`: shared page boot — inject/render the bottom nav,
      initialize the Supabase session (via api-client.js), and expose a disclaimer-gate check
      stub (wired to real logic in T054)
- [ ] T016 [P] Create `public/service-worker.js`: Cache-API-based app-shell caching (install/
      activate/fetch handlers) and register it from `app.js`

**Checkpoint**: Foundation ready — user story phases below can now proceed.

---

## Phase 3: User Story 1 - Instant Craving Dispatch (Priority: P1) 🎯 MVP

**Goal**: A user can log a craving to herself or dispatch it to one support-network member, with
live status tracking, in well under 8 seconds and fully offline for her own side of the flow.

**Independent Test**: Follow quickstart.md §3 — create a self dispatch offline, then (using a
second browser profile registered as a support-network member) send, accept, and advance a
dispatch to "Delivered," confirming the Home banner updates.

### Implementation for User Story 1

- [ ] T017 [P] [US1] Create `public/js/models/dispatch.js`: factory + validation for category
      enum, intensity (1-5), fulfiller choice, and a pure state-machine helper
      (`canTransition(from, to)`) mirroring data-model.md
- [ ] T018 [US1] Add dispatch handling to `public/js/db/local-store.js` (or a co-located
      `public/js/db/dispatch-store.js`): cache reads from Supabase and queue offline-created
      dispatches via `sync-queue.js` (depends on T011, T012, T017)
- [ ] T019 [US1] Implement dispatch create/list/update-status calls in `public/js/api-client.js`
      per contracts/api.md, falling back to the offline queue when the network is unavailable
      (depends on T013, T018)
- [ ] T020 [US1] Build `public/index.html` (Home): greeting, last-dispatch status banner, 2×3
      craving category grid (Salty/Sweet/Sour/Cold Drink/Fresh Fruit/Specific Snack), and a
      quick-add custom request affordance, per blueprint screen H-01
- [ ] T021 [US1] Build `public/dispatch.html` (dispatch form + active status view): category
      (pre-filled from Home), item name/notes, intensity, fulfiller choice (Self / one
      support-network member), submit and cancel controls, per blueprint screens H-02/H-03
- [ ] T022 [US1] Implement `public/js/views/home.js`: render the greeting and last-dispatch
      banner from the local cache, poll for status updates while the page is open, wire category
      grid taps to `dispatch.html`, and render the empty/first-use state copy (depends on T019,
      T020)
- [ ] T023 [US1] Implement `public/js/views/dispatch.js`: form handling and validation, "recently
      used items" suggestions (last 5-10 fulfilled items for the selected category), submit via
      `api-client.js`, cancel action, and status polling for the active dispatch (depends on
      T019, T021)
- [ ] T024 [US1] Build `public/partner.html`: a simplified view listing only dispatches assigned
      to the caller, with Accept / On the way / Delivered controls, per spec User Story 1 & 4
- [ ] T025 [US1] Implement `public/js/views/partner.js`: fetch dispatches with `role=assignee`,
      wire the status-advance controls to `api-client.js`, and poll for new assignments (depends
      on T019, T024)
- [ ] T026 [US1] Add the optional "pregnancy-safe notes" toggle behavior to
      `public/js/views/dispatch.js`: off by default, and when enabled shows a short non-blocking
      note without ever preventing submission (FR-008)
- [ ] T027 [P] [US1] Write `supabase/tests/rls-and-transitions.test.js`: `node --test` cases
      against a local Supabase instance verifying (a) an owner/assignee can only see their own
      dispatches, (b) the status trigger rejects invalid transitions (depends on T006-T010)
- [ ] T028 [P] [US1] Write `tests/unit/models.test.html`: a hand-rolled assertion page covering
      `dispatch.js`'s validation and `canTransition` helper (depends on T017)

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable.

---

## Phase 4: User Story 2 - Comfort & Energy Check-in (Priority: P1)

**Goal**: A user can set today's energy level and log/address comfort statuses, entirely
offline, with gentle suggestions.

**Independent Test**: Follow quickstart.md §4 — set an energy level, select and address a
curated comfort status, add a custom one, repeat with the network disabled.

### Implementation for User Story 2

- [ ] T029 [P] [US2] Create `public/js/models/comfort-entry.js`: factory + validation for
      `DailyComfortEntry` and embedded `ComfortStatusEntry` per data-model.md
- [ ] T030 [US2] Add `DailyComfortEntry` handling (upsert-by-date) to `local-store.js` (depends
      on T011, T029)
- [ ] T031 [P] [US2] Create `public/js/data/comfort-statuses.js`: the curated list of comfort
      statuses (label + 1-3 gentle, non-medical suggestions each) from spec.md's examples
- [ ] T032 [US2] Build `public/comfort.html` (Comfort Dashboard): energy-level control (Low /
      Moderate / Full), expandable comfort-status list, custom-status entry, per blueprint
      screen C-01
- [ ] T033 [US2] Implement `public/js/views/comfort.js`: set/change today's energy level,
      select/expand a status to show its suggestions, add a custom status, toggle "addressed" —
      all persisted purely locally (depends on T030, T031, T032)
- [ ] T034 [P] [US2] Write `tests/unit/local-store.test.html`: assertions for
      `DailyComfortEntry` CRUD, including the "one entry per date" upsert rule (depends on T030)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Appointment Prep (Priority: P2)

**Goal**: A user can create appointments, see a Next Visit countdown with an editable checklist,
and capture questions that persist across visits.

**Independent Test**: Follow quickstart.md §5 — create an appointment, add/check checklist
items, capture a question, confirm the "ready for your visit" summary.

### Implementation for User Story 3

- [ ] T035 [P] [US3] Create `public/js/models/appointment.js`: factory + validation for
      `Appointment` and embedded `ChecklistItem` per data-model.md
- [ ] T036 [P] [US3] Create `public/js/models/question.js`: factory + validation for `Question`
- [ ] T037 [US3] Add `Appointment` and `Question` handling to `local-store.js` (depends on T011,
      T035, T036)
- [ ] T038 [US3] Build `public/care.html` (Appointment Ledger): Next Visit countdown card with
      its checklist, question-capture entry point, and "ready for your visit" summary, per
      blueprint screen A-01
- [ ] T039 [US3] Build `public/appointment-edit.html` (Add/Edit Appointment): title, type,
      date/time, location, checklist editing, per blueprint screen A-02
- [ ] T040 [US3] Implement `public/js/views/care.js`: derive "Next Visit" as the soonest future
      appointment, render its countdown and checklist, capture/list questions independent of any
      one appointment, and compute the "ready for your visit" summary (unchecked items + unasked
      questions) per FR-018 (depends on T037, T038, T039)
- [ ] T041 [US3] Extend `tests/unit/models.test.html` with assertions for the Next-Visit
      derivation and "ready for your visit" summary logic (depends on T028, T040)

**Checkpoint**: User Stories 1, 2, and 3 all work independently.

---

## Phase 6: User Story 4 - Support Network Invite (Priority: P2)

**Goal**: A user can invite a partner/support person via link/code with no signup required for
them, manage their permission level, and revoke access immediately.

**Independent Test**: Follow quickstart.md §6 — generate an invite, accept it in a second
browser profile with no signup, confirm it appears in the member list, then revoke it and
confirm access is lost immediately.

### Implementation for User Story 4

- [ ] T042 [P] [US4] Create `public/js/models/support-member.js`: factory + validation for
      `SupportNetworkMember` per data-model.md
- [ ] T043 [US4] Add `SupportNetworkMember` cache handling to `local-store.js` (depends on T011,
      T042)
- [ ] T044 [US4] Implement invite-create, `accept_invite` RPC, list, and revoke/permission-change
      calls in `public/js/api-client.js` per contracts/api.md (depends on T013, T042)
- [ ] T045 [US4] Build `public/support-network.html`: member list with permission level and
      revoke controls, plus invite-generation UI showing the shareable link/code (simulated
      delivery per FR-023), per blueprint screen P-02
- [ ] T046 [US4] Implement `public/js/views/support-network.js`: create invite, list members
      (including pending), and wire revoke/permission-change actions (depends on T044, T045)
- [ ] T047 [US4] Implement the invite-accept flow in `public/js/views/partner.js`: read the
      `?invite=` query parameter, call `accept_invite`, and persist the resulting session as this
      device's identity before showing the partner dispatch list (depends on T013, T025, T044)
- [ ] T048 [US4] Extend `supabase/tests/rls-and-transitions.test.js` with cases for
      `accept_invite` atomicity (a caller can't claim someone else's invite) and for a revoked
      member immediately losing dispatch access (depends on T010, T027)

**Checkpoint**: User Stories 1 through 4 all work independently.

---

## Phase 7: User Story 5 - Onboarding & Profile (Priority: P3)

**Goal**: A first-time user completes onboarding (including the required disclaimer) and can
later edit her profile.

**Independent Test**: Follow quickstart.md §7 — complete onboarding end-to-end on a fresh
profile, confirm the disclaimer gate, then edit profile fields.

### Implementation for User Story 5

- [ ] T049 [P] [US5] Build `public/onboarding.html`: welcome step, name + due-date/current-week
      step, optional skippable partner-invite step (links into US4's invite creation), a brief
      design/tone preview, and the disclaimer-acknowledgment step, per blueprint screen S-01
- [ ] T050 [US5] Implement `public/js/views/onboarding.js`: step navigation, saving the `User`
      profile to `localStorage` per data-model.md, recording disclaimer acknowledgment, and
      redirecting to Home on completion (depends on T049)
- [ ] T051 [P] [US5] Build `public/profile.html`: name/due-date/current-week/notification
      preference fields, a link to Support Network, and the disclaimer text kept reachable, per
      blueprint screen P-01
- [ ] T052 [US5] Implement `public/js/views/profile.js`: load/edit/save profile fields and
      notification preferences, and link through to `support-network.html` (depends on T051)
- [ ] T053 [US5] Wire the real disclaimer gate in `public/js/app.js`: any page load redirects to
      `onboarding.html` when `disclaimerAcknowledgedAt` is unset (depends on T015, T050)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Constitution compliance and finishing touches across all stories.

- [ ] T054 [P] Accessibility pass: verify WCAG 2.1 AA contrast for every color pairing in
      `tokens.css`, confirm all interactive elements in `components.css` meet the 48px touch
      target minimum, and add reduced-motion and high-contrast mode toggles (FR-029)
- [ ] T055 [P] Add voice input support (via the Web Speech API where available, with a visible
      fallback) to the custom-item field in `public/js/views/dispatch.js` and the question field
      in `public/js/views/care.js`
- [ ] T056 Copy pass across every `public/*.html` page and view module for constitution
      Principle I compliance: no "should/must/avoid" phrasing, no clinical or alarmist tone
      (FR-028)
- [ ] T057 Finalize `public/service-worker.js`'s cached-asset list to cover every page and shared
      CSS/JS file added in Phases 3-7, so the full app shell works offline (depends on all of
      Phase 3-7's HTML/CSS/JS files existing)
- [ ] T058 [P] Update the root `README.md` with setup/run instructions, a design-token summary,
      and a component inventory, per the product blueprint's §12 deliverables
- [ ] T059 Run the full `quickstart.md` validation guide end-to-end (all five user stories plus
      the cross-cutting checks in its §8) and record/fix any gaps found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every user story phase.
- **User Stories (Phases 3-7)**: All depend on Phase 2 completion. Ordered here by spec.md
  priority (P1, P1, P2, P2, P3); Phase 4 (US2) has no dependency on Phase 3 (US1) and could run
  in parallel with it if staffed separately. Phase 6 (US4) provides the invite mechanism Phase 3
  (US1)'s partner path and Phase 7 (US5)'s onboarding step link to — those two phases include a
  soft integration touchpoint (T047, T049) but each story's own independent test in quickstart.md
  still passes without the others being built.
- **Polish (Phase 8)**: Depends on all desired user story phases being complete.

### Within Each User Story

- Models before store/api-client wiring before views/pages.
- A story's `Checkpoint` marks the point at which it is independently testable per quickstart.md.

### Parallel Opportunities

- All Setup tasks marked [P] (T002-T005) can run together.
- Within Foundational, T011-T016 are all [P] (different files) once T006-T010 (the single
  migration file) are done sequentially.
- Once Foundational is complete, Phase 3 (US1) and Phase 4 (US2) can be worked in parallel — they
  touch disjoint files. Phases 5 and 6 can likewise start in parallel with each other once
  Foundational is done, though T047 (US4) touches a file Phase 3 also edits (`partner.js`) so
  should land after T025.

---

## Parallel Example: User Story 1

```bash
# After Foundational is done, launch these together:
Task: "Create public/js/models/dispatch.js"
Task: "Write supabase/tests/rls-and-transitions.test.js"          # once T006-T010 land
Task: "Write tests/unit/models.test.html"                          # once T017 lands
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1 — Instant Craving Dispatch).
3. Validate against quickstart.md §3.
4. This alone is a demoable product: a user can log and dispatch cravings, self or partner.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. Add US1 → validate → demo (MVP).
3. Add US2 → validate → demo.
4. Add US3 → validate → demo.
5. Add US4 → validate → demo (unlocks US1's partner path fully, since invites can now be
   created through the UI rather than assumed).
6. Add US5 → validate → demo (adds the first-run experience around everything above).
7. Phase 8 polish, then a full quickstart.md run.

## Notes

- [P] tasks touch different files and have no incomplete dependency.
- Every task's file path matches plan.md's Project Structure exactly.
- Commit after each task or logical group, per standard project practice.
- Stop at any Checkpoint to validate that story independently before continuing.
