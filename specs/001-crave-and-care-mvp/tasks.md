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

- [X] T001 Create the directory structure from plan.md's Project Structure: `public/css/`,
      `public/js/db/`, `public/js/models/`, `public/js/views/`, `public/icons/`, `supabase/migrations/`,
      `supabase/tests/`, `tests/unit/`
- [X] T002 [P] Run `supabase init` to create `supabase/config.toml` for local development (per
      quickstart.md §2)
- [X] T003 [P] Create `public/css/tokens.css` with the "Modern Nurturing" design tokens as CSS
      custom properties: color palette, type scale, spacing unit (4px), radii, shadow, from the
      product blueprint §2
- [X] T004 [P] Create `public/manifest.webmanifest` (app name, theme/background colors from
      tokens, icon references) and placeholder PWA icons in `public/icons/`
- [X] T005 [P] Add `.editorconfig` and a minimal flat-config ESLint setup (no bundler) covering
      `public/js/**` and `supabase/**/*.js` for consistent style with zero build step

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story depends on. **No user story work starts before this
phase is complete.**

- [X] T006 Write `supabase/migrations/0001_init.sql`: create the `dispatches`,
      `support_network_members`, and `comfort_entries` tables with the fields, enums, and foreign
      keys from data-model.md; enable Row Level Security on all three
- [X] T007 In `supabase/migrations/0001_init.sql`, add RLS policies for `dispatches` (owner can
      insert/select/cancel; assigned member can select/advance status) per contracts/api.md
      (depends on T006)
- [X] T008 In `supabase/migrations/0001_init.sql`, add RLS policies for
      `support_network_members` (owner can insert/select/update; invitee can read only their own
      invite by code) per contracts/api.md (depends on T006)
- [X] T009 In `supabase/migrations/0001_init.sql`, add RLS policies for `comfort_entries`
      (owner-only insert/select/update, keyed by `owner_id = auth.uid()`; no assignee/sharing
      path exists for this table) per contracts/api.md (depends on T006)
- [X] T010 In `supabase/migrations/0001_init.sql`, add the `BEFORE UPDATE` trigger enforcing the
      `dispatches.status` state machine from data-model.md (rejects any transition outside
      `requested→accepted→on_the_way→delivered`, `requested/accepted→cancelled`) (depends on
      T006)
- [X] T011 In `supabase/migrations/0001_init.sql`, add the `accept_invite(invite_code,
      display_name)` `SECURITY DEFINER` RPC function that atomically stamps
      `member_auth_id = auth.uid()` per contracts/api.md (depends on T006)
- [X] T012 [P] Create `public/js/db/local-store.js`: a native-IndexedDB wrapper opening the app
      database and exposing generic `get`/`put`/`delete`/`queryByIndex` helpers, used by every
      client-only entity and as the local read-cache for every Supabase-synced entity
- [X] T013 [P] Create `public/js/db/sync-queue.js`: an offline write-queue skeleton (enqueue a
      pending Supabase write, replay queued writes on `online` events and on page load) used by
      the three server-synced entities
- [X] T014 [P] Create `public/js/api-client.js`: import `supabase-js` as an ES module (CDN, no
      build step), initialize the client, and implement the session bootstrap from
      contracts/api.md (`getSession()` → `signInAnonymously()` if absent)
- [X] T015 [P] Create `public/css/base.css` (resets, typography, layout primitives) and
      `public/css/components.css` (cards, pill buttons, segmented slider, bottom nav, status
      banner) built on `tokens.css` custom properties
- [X] T016 [P] Create `public/js/app.js`: shared page boot — inject/render the bottom nav,
      initialize the Supabase session (via api-client.js), and expose a disclaimer-gate check
      stub (wired to real logic in T058)
- [X] T017 [P] Create `public/service-worker.js`: Cache-API-based app-shell caching (install/
      activate/fetch handlers) and register it from `app.js`

**Checkpoint**: Foundation ready — user story phases below can now proceed.

---

## Phase 3: User Story 1 - Instant Craving Dispatch (Priority: P1) 🎯 MVP

**Goal**: A user can log a craving to herself or dispatch it to one support-network member, with
live status tracking, in well under 8 seconds and fully offline for her own side of the flow.
(The partner-fulfillment half needs an *accepted* support-network member to exist, which the
invite/accept UI built in Phase 6 provides — see Dependencies.)

**Independent Test**: Follow quickstart.md §3 — create a self dispatch offline, then (using a
second browser profile registered as a support-network member) send, accept, and advance a
dispatch to "Delivered," confirming the Home banner updates.

### Implementation for User Story 1

- [X] T018 [P] [US1] Create `public/js/models/dispatch.js`: factory + validation for category
      enum, intensity (1-5), fulfiller choice, and a pure state-machine helper
      (`canTransition(from, to)`) mirroring data-model.md
- [X] T019 [US1] Add dispatch handling to `public/js/db/local-store.js` (or a co-located
      `public/js/db/dispatch-store.js`): cache reads from Supabase and queue offline-created
      dispatches via `sync-queue.js` (depends on T012, T013, T018)
- [X] T020 [US1] Implement dispatch create/list/update-status calls in `public/js/api-client.js`
      per contracts/api.md, falling back to the offline queue when the network is unavailable
      (depends on T014, T019)
- [X] T021 [US1] Build `public/index.html` (Home): greeting, last-dispatch status banner, 2×3
      craving category grid (Salty/Sweet/Sour/Cold Drink/Fresh Fruit/Specific Snack), and a
      quick-add custom request affordance, per blueprint screen H-01
- [X] T022 [US1] Build `public/dispatch.html` (dispatch form + active status view): category
      (pre-filled from Home), item name/notes, intensity, fulfiller choice (Self / one
      support-network member), submit and cancel controls, per blueprint screens H-02/H-03
- [X] T023 [US1] Implement `public/js/views/home.js`: render the greeting and last-dispatch
      banner from the local cache, poll for status updates while the page is open, wire category
      grid taps to `dispatch.html`, and render the empty/first-use state copy (depends on T020,
      T021)
- [X] T024 [US1] Implement `public/js/views/dispatch.js`: form handling and validation, "recently
      used items" suggestions (last 5-10 fulfilled items for the selected category), submit via
      `api-client.js`, cancel action, and status polling for the active dispatch (depends on
      T020, T022)
- [X] T025 [US1] Build `public/partner.html`: a simplified view listing only dispatches assigned
      to the caller, with Accept / On the way / Delivered controls, per spec User Story 1 & 4
- [X] T026 [US1] Implement `public/js/views/partner.js`: fetch dispatches with `role=assignee`,
      wire the status-advance controls to `api-client.js`, and poll for new assignments (depends
      on T020, T025)
- [X] T027 [US1] Add the optional "pregnancy-safe notes" toggle behavior to
      `public/js/views/dispatch.js`: off by default, and when enabled shows a short non-blocking
      note without ever preventing submission (FR-008)
- [X] T028 [P] [US1] Write `supabase/tests/rls-and-transitions.test.js`: `node --test` cases
      against a local Supabase instance verifying (a) an owner/assignee can only see their own
      dispatches, (b) the status trigger rejects invalid transitions (depends on T006-T011)
- [X] T029 [P] [US1] Write `tests/unit/models.test.html`: a hand-rolled assertion page covering
      `dispatch.js`'s validation and `canTransition` helper (depends on T018)

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable (self-dispatch
path fully standalone per spec.md's own Independent Test; the partner path additionally needs
Phase 6, consistent with quickstart.md §3 step 3).

---

## Phase 4: User Story 2 - Comfort & Energy Check-in (Priority: P1)

**Goal**: A user can set today's energy level and log/address comfort statuses, fully offline,
with the data durably backed up (per product-owner decision, comfort/energy history is synced to
Supabase like dispatches are, but stays owner-only — never shared with a support-network member).

**Independent Test**: Follow quickstart.md §4 — set an energy level, select and address a
curated comfort status, add a custom one, repeat with the network disabled, then confirm the
entry appears in Supabase once back online.

### Implementation for User Story 2

- [X] T030 [P] [US2] Create `public/js/models/comfort-entry.js`: factory + validation for
      `DailyComfortEntry` and embedded `ComfortStatusEntry` per data-model.md
- [X] T031 [US2] Add `DailyComfortEntry` handling (upsert-by-date local cache + offline queue) to
      `local-store.js` / `sync-queue.js`, following the same pattern as dispatch handling in
      Phase 3 (depends on T012, T013, T030)
- [X] T032 [US2] Implement comfort-entry create/upsert/list calls in `public/js/api-client.js`
      per contracts/api.md, falling back to the offline queue when the network is unavailable
      (depends on T014, T031)
- [X] T033 [P] [US2] Create `public/js/data/comfort-statuses.js`: the curated list of comfort
      statuses (label + 1-3 gentle, non-medical suggestions each) from spec.md's examples
- [X] T034 [US2] Build `public/comfort.html` (Comfort Dashboard): energy-level control (Low /
      Moderate / Full), expandable comfort-status list, custom-status entry, per blueprint
      screen C-01
- [X] T035 [US2] Implement `public/js/views/comfort.js`: set/change today's energy level,
      select/expand a status to show its suggestions, add a custom status, toggle "addressed" —
      saved locally first, then synced via `api-client.js` (depends on T032, T033, T034)
- [X] T036 [P] [US2] Extend `supabase/tests/rls-and-transitions.test.js` with `comfort_entries`
      RLS cases: an owner can read/write only her own entries, and no other caller (including an
      accepted support-network member) can read them (depends on T009, T028)
- [X] T037 [P] [US2] Write `tests/unit/local-store.test.html`: assertions for
      `DailyComfortEntry` CRUD, including the "one entry per (owner, date)" upsert rule (depends
      on T031)

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Appointment Prep (Priority: P2)

**Goal**: A user can create appointments, see a Next Visit countdown with an editable checklist,
and capture questions that persist across visits.

**Independent Test**: Follow quickstart.md §5 — create an appointment, add/check checklist
items, capture a question, confirm the "ready for your visit" summary.

### Implementation for User Story 3

- [X] T038 [P] [US3] Create `public/js/models/appointment.js`: factory + validation for
      `Appointment` and embedded `ChecklistItem` per data-model.md
- [X] T039 [P] [US3] Create `public/js/models/question.js`: factory + validation for `Question`
- [X] T040 [US3] Add `Appointment` and `Question` handling to `local-store.js` (purely local, no
      sync-queue involvement) (depends on T012, T038, T039)
- [X] T041 [US3] Build `public/care.html` (Appointment Ledger): Next Visit countdown card with
      its checklist, question-capture entry point, and "ready for your visit" summary, per
      blueprint screen A-01
- [X] T042 [US3] Build `public/appointment-edit.html` (Add/Edit Appointment): title, type,
      date/time, location, checklist editing, per blueprint screen A-02
- [X] T043 [US3] Implement `public/js/views/care.js`: derive "Next Visit" as the soonest future
      appointment, render its countdown and checklist, capture/list questions independent of any
      one appointment, and compute the "ready for your visit" summary (unchecked items + unasked
      questions) per FR-018 (depends on T040, T041, T042)
- [X] T044 [US3] Extend `tests/unit/models.test.html` with assertions for the Next-Visit
      derivation and "ready for your visit" summary logic (depends on T029, T043)

**Checkpoint**: User Stories 1, 2, and 3 all work independently.

---

## Phase 6: User Story 4 - Support Network Invite (Priority: P2)

**Goal**: A user can invite a partner/support person via link/code with no signup required for
them, manage their permission level, and revoke access immediately.

**Independent Test**: Follow quickstart.md §6 — generate an invite, accept it in a second
browser profile with no signup, confirm it appears in the member list, then revoke it and
confirm access is lost immediately.

### Implementation for User Story 4

- [ ] T045 [P] [US4] Create `public/js/models/support-member.js`: factory + validation for
      `SupportNetworkMember` per data-model.md
- [ ] T046 [US4] Add `SupportNetworkMember` cache handling to `local-store.js` (depends on T012,
      T045)
- [ ] T047 [US4] Implement invite-create, `accept_invite` RPC, list, and revoke/permission-change
      calls in `public/js/api-client.js` per contracts/api.md (depends on T014, T045)
- [ ] T048 [US4] Build `public/support-network.html`: member list with permission level and
      revoke controls, plus invite-generation UI showing the shareable link/code (simulated
      delivery per FR-023), per blueprint screen P-02
- [ ] T049 [US4] Implement `public/js/views/support-network.js`: create invite, list members
      (including pending), and wire revoke/permission-change actions (depends on T047, T048)
- [ ] T050 [US4] Implement the invite-accept flow in `public/js/views/partner.js`: read the
      `?invite=` query parameter, call `accept_invite`, and persist the resulting session as this
      device's identity before showing the partner dispatch list (depends on T014, T026, T047)
- [ ] T051 [US4] Extend `supabase/tests/rls-and-transitions.test.js` with cases for
      `accept_invite` atomicity (a caller can't claim someone else's invite) and for a revoked
      member immediately losing dispatch access (depends on T011, T028)

**Checkpoint**: User Stories 1 through 4 all work independently.

---

## Phase 7: User Story 5 - Onboarding & Profile (Priority: P3)

**Goal**: A first-time user completes onboarding (including the required disclaimer) and can
later edit her profile — including optionally linking an email so she can resume her profile,
dispatches, comfort history, and support network on a second device (FR-031).

**Independent Test**: Follow quickstart.md §7 (onboarding + profile) and §8 (account linking
across two devices).

### Implementation for User Story 5

- [ ] T052 [P] [US5] Build `public/onboarding.html`: welcome step (including an "I've used
      Crave & Care before" path into the sign-in flow for returning users), name +
      due-date/current-week step, optional skippable partner-invite step (links into US4's
      invite creation), a brief design/tone preview, and the disclaimer-acknowledgment step, per
      blueprint screen S-01
- [ ] T053 [US5] Implement `public/js/views/onboarding.js`: step navigation, saving the `User`
      profile to `localStorage` per data-model.md, recording disclaimer acknowledgment,
      redirecting to Home on completion, and wiring the "I've used Crave & Care before" path to
      `supabase.auth.signInWithOtp({ email })` per contracts/api.md (depends on T014, T052)
- [ ] T054 [P] [US5] Build `public/profile.html`: name/due-date/current-week/notification
      preference fields, a link to Support Network, the disclaimer text kept reachable, and a
      "back up my account" section (optional email field + link-status indicator: not linked /
      confirmation pending / linked), per blueprint screen P-01
- [ ] T055 [US5] Implement `public/js/views/profile.js`: load/edit/save profile fields and
      notification preferences, link through to `support-network.html`, and implement the
      optional email-link flow via `supabase.auth.updateUser({ email })` (FR-031), reflecting
      link status from `supabase.auth.onAuthStateChange` (depends on T014, T054)
- [ ] T056 [US5] Implement the magic-link confirmation handler (shared code in `app.js`,
      triggered on any page load that carries a Supabase auth callback): complete the
      email-link/sign-in, and — specifically for the "resume on a second device" path (not the
      "link my current device" path, which already has all its own data) — pull the user's
      existing Supabase-synced data (dispatches, support-network members, comfort entries) into
      the local cache, then prompt for the local-only profile fields (name, due date) that don't
      travel with the account, per contracts/api.md's noted limitation (depends on T014, T019,
      T032, T047, T053, T055)
- [ ] T057 [US5] Ensure normal use of every other feature (dispatch, comfort, appointments)
      remains fully available and unaffected while an email link is "pending" but not yet
      confirmed, per FR-031's "never required" clause (depends on T055)
- [ ] T058 [US5] Wire the real disclaimer gate in `public/js/app.js`: any page load redirects to
      `onboarding.html` when `disclaimerAcknowledgedAt` is unset (depends on T016, T053)

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Constitution compliance and finishing touches across all stories.

- [ ] T059 [P] Accessibility pass: verify WCAG 2.1 AA contrast for every color pairing in
      `tokens.css`, confirm all interactive elements in `components.css` meet the 48px touch
      target minimum, and add reduced-motion and high-contrast mode toggles (FR-029)
- [ ] T060 [P] Add voice input support (via the Web Speech API where available, with a visible
      fallback) to the custom-item field in `public/js/views/dispatch.js` and the question field
      in `public/js/views/care.js` (FR-029)
- [ ] T061 Copy pass across every `public/*.html` page and view module for constitution
      Principle I compliance: no "should/must/avoid" phrasing, no clinical or alarmist tone
      (FR-028)
- [ ] T062 Finalize `public/service-worker.js`'s cached-asset list to cover every page and shared
      CSS/JS file added in Phases 3-7, so the full app shell works offline (depends on all of
      Phase 3-7's HTML/CSS/JS files existing)
- [ ] T063 [P] Update the root `README.md` with setup/run instructions, a design-token summary,
      and a component inventory, per the product blueprint's §12 deliverables
- [ ] T064 Run the full `quickstart.md` validation guide end-to-end (all five user stories, the
      cross-device account-linking check in its §8, and the cross-cutting checks in its §9) and
      record/fix any gaps found

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks every user story phase.
- **User Stories (Phases 3-7)**: All depend on Phase 2 completion. Ordered here by spec.md
  priority (P1, P1, P2, P2, P3); Phase 4 (US2) has no dependency on Phase 3 (US1) and could run
  in parallel with it if staffed separately. Phase 6 (US4) provides the invite mechanism Phase 3
  (US1)'s partner path and Phase 7 (US5)'s "returning user" sign-in link to — those phases include
  soft integration touchpoints (T050, T053, T056) but each story's own independent test in
  quickstart.md still passes without the others being built.
- **Polish (Phase 8)**: Depends on all desired user story phases being complete.

### Within Each User Story

- Models before store/api-client wiring before views/pages.
- A story's `Checkpoint` marks the point at which it is independently testable per quickstart.md.

### Parallel Opportunities

- All Setup tasks marked [P] (T002-T005) can run together.
- Within Foundational, T012-T017 are all [P] (different files) once T006-T011 (the single
  migration file) are done sequentially.
- Once Foundational is complete, Phase 3 (US1) and Phase 4 (US2) can be worked in parallel — they
  touch disjoint files. Phases 5 and 6 can likewise start in parallel with each other once
  Foundational is done, though T050 (US4) touches a file Phase 3 also edits (`partner.js`) so
  should land after T026, and T056 (US5) depends on api-client work from Phases 3, 4, and 6
  (T019/T020, T032, T047) so Phase 7's final integration task naturally lands last.

---

## Parallel Example: User Story 1

```bash
# After Foundational is done, launch these together:
Task: "Create public/js/models/dispatch.js"
Task: "Write supabase/tests/rls-and-transitions.test.js"          # once T006-T011 land
Task: "Write tests/unit/models.test.html"                          # once T018 lands
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
3. Add US2 → validate → demo (comfort/energy data now also durable and cross-device-ready).
4. Add US3 → validate → demo.
5. Add US4 → validate → demo (unlocks US1's partner path fully, since invites can now be
   created through the UI rather than assumed).
6. Add US5 → validate → demo (adds the first-run experience, profile editing, and the optional
   account-linking upgrade around everything above).
7. Phase 8 polish, then a full quickstart.md run.

## Notes

- [P] tasks touch different files and have no incomplete dependency.
- Every task's file path matches plan.md's Project Structure exactly.
- Commit after each task or logical group, per standard project practice.
- Stop at any Checkpoint to validate that story independently before continuing.
