# Quickstart: Validating the Crave & Care MVP

This is a manual, human-run validation guide — it proves the feature works end-to-end against
the acceptance scenarios in `spec.md`. It is not a substitute for the automated unit tests under
`tests/unit/` and `supabase/tests/`.

## Prerequisites

- A modern browser (Chrome, Safari, Firefox, or Edge) — no install needed for the frontend.
- Node.js 20+, the Supabase CLI, and Docker (which the Supabase CLI uses to run Postgres
  locally) — only if validating the sync backend locally.
- No paid service is required to run everything locally; a free Supabase account is only needed
  once you're ready to deploy, not for local validation.

## 1. Run the frontend (static files, no build step)

From the repository root:

```bash
npx serve public
# or: python3 -m http.server --directory public 8080
```

Open the printed local URL in a browser. Because there's no build step, editing any file under
`public/` and reloading is enough to see the change — no watch/rebuild process to run.

## 2. Run the sync backend locally

From the repository root:

```bash
supabase start        # boots local Postgres + auth + the generated REST API
supabase db reset      # applies supabase/migrations/0001_init.sql
```

Point the frontend's `js/api-client.js` at the local Supabase URL and anon key printed by
`supabase start` (two constants to edit — no environment-variable tooling needed for local dev).

## 3. Validate User Story 1 — Instant Craving Dispatch (P1)

1. On the Home screen, tap the "Salty" category → confirm the dispatch form opens pre-selected
   (spec Acceptance Scenario 1).
2. Fill in an item name, set intensity, choose "Self," confirm → confirm it's saved instantly and
   the Home banner reflects it (Scenario 2). Try this with the browser's network throttled to
   "offline" first — it should still save (Scenario 7, FR-009).
3. To validate the partner path (Scenarios 3-5), you need a second "device": open a second
   browser profile or a private/incognito window.
   - In the Support Network screen (see Story 4 below) generate an invite and open its link in
     the second window to register it as a support-network member.
   - Back in the first window, send a dispatch choosing that member as the fulfiller → confirm
     status starts at "Requested."
   - In the second window's partner view, accept it, then mark "On the way," then "Delivered" →
     confirm the first window's Home banner updates to match at each step (poll interval applies;
     wait up to ~30s or refresh).
4. Re-open the dispatch form for the same category → confirm previously used items appear as
   suggestions (Scenario 6, FR-007).

## 4. Validate User Story 2 — Comfort & Energy Check-in (P1)

1. Open the Comfort tab, set today's energy level → confirm it's shown and editable if you
   reopen the tab later the same day (Scenarios 1-2).
2. Select a curated comfort status (e.g. "Needs Lower Back Relief") → confirm it expands with
   1-3 suggestions and an "addressed" control (Scenario 3).
3. Add a custom status with your own label → confirm it saves and can also be marked addressed
   (Scenario 4).
4. With the browser's network throttled to "offline," repeat step 1 → confirm it still saves
   locally right away (Scenario 5, FR-013). Then re-enable the network and confirm (via the
   Supabase Studio local dashboard, or a `select * from comfort_entries` in `supabase db`) that
   the entry appears in the `comfort_entries` table once connectivity returns.

## 5. Validate User Story 3 — Appointment Prep (P2)

1. Create an appointment with a title, type, and a near-future date/time → confirm it appears as
   the "Next Visit" with a day countdown (Scenarios 1-2).
2. Add a couple of checklist items and check one off → confirm the checklist starts empty and
   updates correctly (Scenario 3, FR-016).
3. Capture a question independent of any specific appointment screen → confirm it persists and
   is not tied to one appointment (Scenario 4, FR-017).
4. With the appointment date within a few days, revisit the Appointment Ledger → confirm the
   "ready for your visit" summary lists the unchecked items and unasked question together
   (Scenario 5, FR-018).

## 6. Validate User Story 4 — Support Network Invite (P2)

1. From the Support Network screen, create an invite → confirm a shareable link/code is
   generated with no signup required (Scenario 1, FR-019/FR-023).
2. Open the invite link in a second browser profile, optionally enter a display name → confirm
   immediate access with no account-creation step (Scenario 2, FR-020).
3. Back in the first window's Support Network list → confirm the new member appears with their
   permission level and options to revoke (Scenario 3).
4. Revoke that member's access → confirm their partner view (second window) immediately loses
   access to dispatches on next load (Scenario 4, FR-021, SC-007).
5. Confirm the partner view only ever shows dispatches assigned to that member — not the full app
   (Scenario 5, FR-022).

## 7. Validate User Story 5 — Onboarding & Profile (P3)

1. Clear local storage (or use a fresh browser profile) and open the app → confirm the welcome →
   name/due-date → optional partner invite (skippable) → design preview → disclaimer flow appears
   in order (Scenario 1, FR-024).
2. Confirm you cannot proceed past the disclaimer step without acknowledging it, and that it does
   not reappear as a blocking step on subsequent opens (Scenario 2, FR-025).
3. From Profile, edit name/due-date/notification preferences and navigate to Support Network from
   there (Scenario 3, FR-026). Confirm the disclaimer text is still reachable from Profile
   (FR-027).
4. From Profile, choose "back up my account" and enter an email → confirm normal use of the app
   (dispatch, comfort, appointments) is completely unaffected before you confirm the emailed link
   (FR-031's "never required" clause). Click the confirmation link (via the local Supabase
   instance's test inbox, e.g. Inbucket at `http://localhost:54324` when running `supabase
   start`) → confirm Profile now shows the account as linked.

## 8. Validate account linking across devices (FR-031, SC-008)

1. With an account already linked (previous section), open the app in a second browser profile
   (a fresh, unlinked "device").
2. Choose "I've used Crave & Care before" (or equivalent) on the welcome step, enter the same
   email, and confirm via the emailed link on that second device.
3. Confirm the second device now shows the same craving dispatches, comfort/energy history, and
   support-network members as the first device (SC-008). Note: locally-only profile fields (name,
   due date) are not carried over automatically — confirm the app prompts to re-enter them rather
   than showing stale/blank data as if it were an error.

## 9. Spot-check cross-cutting requirements

- **Tone (FR-028)**: skim every screen's copy for "should/must/avoid" phrasing or clinical tone —
  none should appear.
- **Accessibility (FR-029)**: run a contrast checker against `tokens.css` color pairs; confirm
  interactive elements are ≥48px; toggle reduced-motion/high-contrast modes and confirm they take
  effect.
- **Offline core (SC-005)**: with network fully disabled, repeat steps 3.2 and 4.1 — both must
  still succeed and be visibly saved.
- **Timing (SC-001)**: time yourself performing step 3.1-3.2 from a cold app open — should be well
  under 8 seconds of active interaction.

## Validation record (implementation pass)

What was actually run against this build, and how, during `/speckit.implement`:

- **Backend logic (RLS, status trigger, `accept_invite` RPC)**: exercised against a real
  Postgres instance (not a mock), with a hand-built `auth` schema replicating Supabase's exact
  `auth.uid()` contract and `authenticated`/`anon` roles. Covers: owner/assignee dispatch
  isolation, the full status state machine (including rejecting invalid transitions and
  terminal states), `accept_invite` atomicity, immediate access loss on revoke, and
  `comfort_entries` owner-only isolation. This caught and fixed a real bug (revoked members
  retaining dispatch access) before it reached any real user.
- **Frontend**: every page exercised end-to-end in real headless Chromium — onboarding through
  to Home, comfort logging, appointment + checklist + question flow, support-network invite
  creation, and the full offline-queue/service-worker caching behavior with network access cut
  entirely. This caught and fixed four real bugs: an offline-first regression where a failed
  network import blocked an entire page's interactivity, a destructuring bug that broke the
  "add checklist item" button, a CSS cascade bug where `hidden` silently lost to component
  `display` rules across most of the app's show/hide UI, and the WCAG contrast failure noted
  above.
- **Not run**: the true cross-device dispatch flow through a live Supabase project (real
  PostgREST + `supabase-js` over HTTP, two actual devices). This environment's network policy
  blocks Docker registry pulls, so `supabase start` cannot complete here. The database logic
  underneath that flow was verified as described above; what's unverified is specifically the
  PostgREST/supabase-js HTTP layer itself, which is third-party infrastructure outside this
  codebase. Recommend running quickstart.md §3 and §8 by hand once against a real Supabase
  project before considering this fully sign-off-ready.
