# Crave & Care — Handoff / Continuation Notes

**Purpose of this file:** paste this into a fresh Claude chat (claude.ai) to pick up exactly
where this session left off, without needing to re-explain the project. It covers what the app
is, what's live, what's broken, and what to do next.

Last updated: 2026-08-16, commit `<REPLACE_ME>` on branch `main`.

---

## 1. What this is

**Crave & Care** is a calm, supportive pregnancy-companion PWA. No signup required for the
pregnant person or the people she invites to help. Six core features:

1. **Instant Craving Dispatch** — tap a category (salty/sweet/sour/etc.), send a request to
   yourself or a support-network member, track status (requested → accepted → on the way →
   delivered).
2. **Comfort & Energy Check-in** — daily energy level + symptom/status tracking.
3. **Appointment Prep** — appointment ledger with prep checklists and a running question list.
4. **Support Network** — invite a partner/friend via a link (no account needed on their end), with
   a per-invite permission level chosen by the owner at creation time:
   - `dispatch_recipient` (default): sees only the dispatches assigned to them.
   - `full_support_access`: also sees the owner's mood/energy check-in history.
   Neither level shows the full app — appointments, questions, profile, and Timeline photos
   remain owner-only regardless of permission level (see §5's open item on Timeline sharing).
5. **Onboarding & Profile** — name/due date, disclaimer, optional email-based account linking for
   cross-device resume.
6. **Full Journey Timeline** — a photo/ultrasound/milestone journal, local-only (never leaves the
   device — see §5).

Plus: **WhatsApp invite sharing** — one-tap "Send via WhatsApp" button next to the invite link,
and an optional label on each invite ("Who's this for?") so multiple pending invites are
identifiable before they're accepted.

Built via the [GitHub Spec Kit](https://github.com/github/spec-kit) workflow
(constitution → specify → plan → tasks → analyze → implement). All artifacts live in
`specs/001-crave-and-care-mvp/` (spec.md, plan.md, data-model.md, contracts/api.md,
quickstart.md, tasks.md). FR-022 was updated this session to reflect the two-tier partner view
above — spec.md is the source of truth if this file and it ever disagree.

---

## 2. Live deployment

- **App URL**: `https://quiquandon-oss.github.io/RevaPregnancy/`
  — **case-sensitive and needs the trailing slash**. A lowercased or truncated version of this
  URL (e.g. from a mangled WhatsApp-forwarded link) 404s with GitHub's generic
  "There isn't a GitHub Pages site here" page even though the real site is fine. If anyone reports
  a 404, first get them to type the URL above fresh rather than tapping a forwarded link.
- **Repo**: `https://github.com/quiquandon-oss/RevaPregnancy` (the very first commits used a
  lowercase `revapregnancy` remote URL — GitHub redirects it, harmless, but use the exact-case
  URL above when possible).
- **Hosting**: GitHub Pages, deployed via `.github/workflows/deploy-pages.yml` on every push to
  `main`. Deploys take about 15–30 seconds; check the Actions tab to confirm success.
- **Backend**: Supabase project `zwxfmdhgnlhtkixfkdob` ("crave-and-care"). Dashboard:
  `https://supabase.com/dashboard/project/zwxfmdhgnlhtkixfkdob`. The anon/publishable key is
  already embedded in `public/js/api-client.js` (safe to be public — it's the client key, RLS
  does the real access control). If you have Supabase MCP tools available, `execute_sql` /
  `apply_migration` against project_id `zwxfmdhgnlhtkixfkdob` work directly — much faster than
  guessing at DB state from the code alone.
- **PWA install**: works from any page, including `partner.html` (which has its own
  `partner-manifest.webmanifest` so an installed shortcut on a support-network member's phone
  reopens their own restricted view, not the owner's full app).

---

## 3. Known issues / open items

1. **Timeline photos aren't shared with support-network members yet.** They're local-only
   (IndexedDB, per-device, never synced — see §5) by original design, so there's currently no
   server-side mechanism for a partner on a different device to see them at all, even with
   `full_support_access`. Building this needs real new infrastructure (a Supabase Storage bucket
   or similar, a synced table, RLS, upload/sync logic in `memory-store.js`, and a display section
   in `partner.html`) — it's a genuinely bigger lift than the mood/energy sharing built this
   session, which just reused existing sync. Flagged to the account owner as a follow-up; not
   started.
2. **No real push notifications exist.** "Notification preferences" on the Profile screen
   (`dispatchUpdates` / `comfortReminders`) is currently just a toggle with nothing behind it — no
   `Notification.requestPermission()`, no service worker push handler, no delivery mechanism.
   Someone asked about this expecting a phone alert on a new dispatch; that doesn't exist yet.
3. **Anonymous Sign-Ins are now working** (previously the top item here — resolved as of this
   session; `select count(*) from auth.users` returns real rows). If a fresh session ever sees
   auth-dependent features failing again, re-check this first before assuming it's something else,
   but don't assume it's broken by default anymore.

---

## 4. Recent debugging history (this session)

Several bugs traced back to the **same root cause repeated four times**: this is a GitHub Pages
*project* site (lives at `/RevaPregnancy/`, not domain root), and several places in the code
assumed root-absolute paths or `window.location.origin` alone. Watch for this pattern in
anything new:
1. `inviteLink()` used `window.location.origin` alone → generated links like
   `https://quiquandon-oss.github.io/partner.html?invite=CODE` (missing `/RevaPregnancy/`) → 404.
   Fixed by deriving the base path from the current page's own location instead.
2. `manifest.webmanifest`'s `start_url`/`scope` were root-absolute (`/index.html`, `/`) → PWA
   install 404'd for everyone, including support-network members installing from
   `partner.html`. Fixed with page-relative values, and split `partner.html` onto its own
   manifest so its install target is itself, not the owner's `index.html`.
3. The onboarding "Invite someone now" button navigated to `support-network.html`, which enforces
   the disclaimer gate (FR-025) — but per FR-024's required step order, invite happens *before*
   disclaimer, so it silently bounced back to onboarding's welcome screen. Fixed by building the
   invite UI inline into the onboarding step itself (exempt from the gate) instead of navigating
   away.
4. Separately (not the path bug): a few test invites got created and revoked within seconds of
   each other during manual testing — confirmed via direct DB query, not a code bug. Worth
   knowing the "Invite someone now" button doesn't yet disable itself on click, so a slow network
   response plus impatient re-tapping could still create duplicate invites.

Then, at the account owner's request, partner access was expanded beyond dispatches-only:
- Added a per-invite permission picker (`dispatch_recipient` vs `full_support_access`) to both
  invite-creation flows.
- New RLS policy (`supabase/migrations/0002_support_member_comfort_access.sql`) lets accepted
  `full_support_access` members read the owner's `comfort_entries`.
- `partner.html` now shows a mood/energy section for members with that permission level, refreshed
  alongside the existing dispatch poll.
- `spec.md` FR-022 and its acceptance scenarios updated to match (was previously
  dispatches-only, stated as a hard restriction).

---

## 5. Architecture essentials

- **Zero build step.** Plain HTML + CSS + vanilla JS (ES modules). No framework, no bundler. This
  was an explicit, deliberate choice early in the project — don't introduce React/Vue/Tailwind/a
  bundler/etc. without re-confirming that's actually wanted.
- **Offline-first.** The app must work with zero network the moment it's opened. Supabase calls
  are lazy dynamic imports wrapped so they never throw synchronously (`api-client.js`'s
  `withClient()`), and `bootPage()` never awaits network calls. A service worker
  (`service-worker.js`, stale-while-revalidate) precaches the full app shell — bump `CACHE_NAME`
  whenever `CORE_ASSETS` changes *or* whenever the content of an already-listed file changes, or
  returning visitors keep seeing stale/broken behavior from cache. Current version: `v7`.
- **Path discipline**: always use paths relative to the current file (`index.html`, not
  `/index.html`; `window.location.pathname`-derived bases, not bare `window.location.origin`) —
  see §4's repeated root-cause pattern. This app is deployed under a subpath; nothing should
  assume it lives at the domain root.
- **What syncs vs. stays local:**
  - Synced via Supabase (Postgres + RLS): dispatches, support-network members, comfort entries.
  - Local-only (IndexedDB, never leaves device): appointments, questions, profile, and Timeline
    memories/photos (see §3, item 1 — this is the next likely ask).
- **Two "logged in" experiences on the same Supabase project, now with a permission split on one
  of them:**
  - The pregnant woman: full app, own anonymous session, sees everything she owns, own PWA
    manifest (`manifest.webmanifest`, `start_url: index.html`).
  - An invited support-network member: `partner.html?invite=CODE`, a separate restricted view
    with its own manifest (`partner-manifest.webmanifest`, `start_url: partner.html`). What they
    see depends on the permission level the owner chose at invite time — dispatches only, or
    dispatches + mood/energy. Never the full app (appointments/questions/profile/Timeline stay
    owner-only regardless of level).
- **RLS is the real security boundary**, not the app code. See
  `supabase/migrations/0001_init.sql` for the original schema/policies and `0002_*.sql` for the
  comfort-access addition; `supabase/tests/rls-and-transitions.test.js` exercises them against a
  real Postgres instance (needs `supabase start`, i.e. Docker — see README for local dev; that
  test file has *not* been updated for the 0002 migration yet).

---

## 6. File map

```text
public/                      # entire frontend — static, deployable anywhere
  *.html                       # one file per screen (index=Home, comfort, care=Appointment
                                #   Ledger, timeline=Journey feature, support-network,
                                #   partner=invited-member view, profile, onboarding)
  manifest.webmanifest          # owner's PWA manifest (start_url: index.html)
  partner-manifest.webmanifest  # support-network member's PWA manifest (start_url: partner.html)
  css/tokens.css                # design tokens ("Modern Nurturing": sage green + dusty rose)
  css/base.css, components.css  # resets + reusable component classes
  js/api-client.js              # all Supabase calls, lazy-loaded, fail-soft
  js/app.js                     # shared boot: bottom nav, disclaimer gate, a11y prefs, session
  js/identity.js                # resolves current Supabase Auth identity
  js/db/                        # one IndexedDB/localStorage store module per entity
  js/models/                    # pure factory/validation functions, no I/O
  js/views/                     # one controller module per page
  service-worker.js             # offline app-shell caching, CACHE_NAME v7

supabase/migrations/
  0001_init.sql                       # schema + RLS + status trigger + accept_invite() RPC
  0002_support_member_comfort_access.sql   # RLS: full_support_access members can read comfort_entries
supabase/tests/                      # RLS/transition tests (node --test, needs local Supabase)
tests/unit/*.test.html               # browser-run assertion pages, open directly

specs/001-crave-and-care-mvp/        # spec, plan, data model, API contract, tasks (Spec Kit)
.github/workflows/deploy-pages.yml   # GitHub Pages CI/CD, triggers on push to main
```

---

## 7. If you're a fresh Claude session picking this up

1. **Check §3** for currently-known open items before assuming something's broken or working.
2. **Deploys are automatic** on push to `main` — no separate "deploy" step needed, just commit and
   push, then check the Actions tab (or ask the account owner to hard-refresh / fully close and
   reopen the tab, since the service worker caches aggressively).
3. **Don't add a framework or CDN dependency** without checking — this is a deliberate
   architectural constraint (see §5), not an oversight.
4. **Watch for the root-absolute-path bug pattern** (§4) in anything new — it's bitten this
   project four separate times already.
5. **Multiple people test this app** (the account owner, plus whoever they've invited — e.g. a
   partner, a parent). Confirm who you're talking to before making account/architecture-level
   decisions, and don't assume a phone described in conversation belongs to the account owner.
6. **Timeline photo sharing with partners is the most likely next ask** (§3, item 1) — it's a
   real infrastructure addition (Storage bucket, sync, RLS, UI), not a quick fix. Worth sizing
   and confirming the approach (storage bucket vs. inline, size caps, etc.) with the account
   owner before building rather than guessing.
7. Full task-by-task build history: `specs/001-crave-and-care-mvp/tasks.md`. Manual QA walkthrough
   for all five original stories: `specs/001-crave-and-care-mvp/quickstart.md` (not yet updated
   for the permission-tier or comfort-sharing changes).
