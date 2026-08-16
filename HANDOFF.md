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
2. **Comfort & Energy Check-in** — daily energy level + symptom/status tracking, synced.
3. **Appointment Prep** — appointment ledger with prep checklists and a running question list.
   Local-only (device-only), by design — never been asked to sync this.
4. **Support Network** — invite a partner/friend via a link (no account needed on their end),
   with a per-invite permission level chosen by the owner at creation time:
   - `dispatch_recipient` (default): sees only the dispatches assigned to them.
   - `full_support_access`: also sees the owner's mood/energy check-ins **and Timeline**
     (photos, ultrasounds, milestones).
   Neither level shows the full app — appointments, questions, and profile stay owner-only
   regardless of permission level. A member's own view is a genuine two-tab mini-app
   (`partner.html` = Requests, `partner-timeline.html` = Timeline — only shown to
   `full_support_access` members), with its own nav (`js/partner-shared.js`), not the owner's.
5. **Onboarding & Profile** — name/due date, disclaimer, optional email-based account linking for
   cross-device resume.
6. **Full Journey Timeline** — a photo/ultrasound/milestone journal. Synced (compressed photos in
   Supabase Storage + metadata in Postgres) so it survives device loss, resumes on a second
   device, and is visible to `full_support_access` partners. Full-quality originals still stay
   on the device that took them; only the synced copy is compressed (see §5). A
   `full_support_access` member can also **add** memories (with their own photo upload) via
   `partner-timeline.html` — not just view the owner's.
7. **Chat + push notifications, per dispatch.** Real-time (Supabase Realtime, not polling)
   two-way messaging attached to each craving request, with read receipts and a "Seen"
   indicator on the request itself. Backed by real Web Push (VAPID) — a Supabase Edge Function
   (`send-push`) triggered by a Postgres webhook sends actual OS-level notifications to
   whichever side didn't cause the event. See §5 for the full pipeline.

Plus: **WhatsApp invite sharing** — one-tap "Send via WhatsApp" button next to the invite link,
and an optional label on each invite ("Who's this for?") so multiple pending invites are
identifiable before they're accepted.

Built via the [GitHub Spec Kit](https://github.com/github/spec-kit) workflow
(constitution → specify → plan → tasks → analyze → implement). All artifacts live in
`specs/001-crave-and-care-mvp/` (spec.md, plan.md, data-model.md, contracts/api.md,
quickstart.md, tasks.md). **`data-model.md` predates the Timeline feature and hasn't been
updated for it or for the permission-tier changes** — spec.md's FR-022 and acceptance scenarios
1-6 are current; data-model.md, tasks.md, and quickstart.md are not, and are worth formalizing
if this project gets a "real" Spec Kit pass again rather than incremental chat-driven changes.

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
  guessing at DB state from the code alone. There's also a private `memories` Storage bucket
  now (photo binaries; 3MB server-side cap) — no dedicated bucket-creation MCP tool exists, it
  was created via `insert into storage.buckets (...)` inside a migration.
- **PWA install**: works from any page, including `partner.html` (which has its own
  `partner-manifest.webmanifest` so an installed shortcut on a support-network member's phone
  reopens their own restricted view, not the owner's full app).

---

## 3. Known issues / open items

1. **Push notifications are real now, but untested end-to-end from a human's actual phone.**
   The full pipeline (VAPID + service worker push handler + Edge Function + Postgres webhook)
   is deployed and the DB→Edge-Function leg was verified directly (a test webhook call got a
   clean 200 response). What hasn't been verified: an actual OS-level notification arriving on
   a real device after enabling it via Profile / partner.html's "Enable notifications" button.
   If it doesn't fire, check (in order): was permission actually granted (browser-level, not
   just app-level)? Does `push_subscriptions` have a row for that device (`select * from
   push_subscriptions`)? Check the `send-push` Edge Function's logs (`query_logs` MCP tool,
   source `function_edge_logs`) for the actual invocation and any error.
2. **`supabase/tests/rls-and-transitions.test.js` hasn't been updated** for any of migrations
   0002 through 0007 — it only exercises the original 0001 schema.
3. **Chat/push secrets aren't in this repo, by design.** The VAPID private key and the
   DB→Edge-Function webhook secret live only in Supabase Vault (`vault.decrypted_secrets`,
   names `vapid_private_key` / `push_webhook_secret`) — 0005's migration file has a comment
   explaining this rather than the actual `vault.create_secret()` calls (re-running those on a
   fresh apply would error, since the names already exist). The VAPID **public** key is not
   secret and is hardcoded in both `api-client.js` and `supabase/functions/send-push/index.ts`.
4. **Anonymous Sign-Ins, once a blocker, now work fine** — resolved a few sessions ago. Don't
   assume it's broken by default anymore; if auth-dependent features ever fail again, `select
   count(*) from auth.users` is the fastest way to check.
5. **Deleting a synced memory is best-effort, not queued.** If you delete a Timeline entry while
   offline (or the delete call fails), the local copy is gone immediately but the remote
   row/photo can be left behind — deletes aren't retried like creates are (see
   `js/db/memory-store.js`'s `deleteMemory`). A deliberate scope cut, not an oversight.

---

## 4. Recent debugging/feature history (most recent session first)

**Most recent session — chat, push notifications, and a real two-tab partner app:**
Account owner asked for: (1) real notifications with delivery/read receipts and two-way
replies "same as a WhatsApp chat", and (2) the partner side restructured to mirror the owner's
— a Requests tab (with chat per request) and a Timeline tab (with upload). Built:
- **Per-dispatch chat**: new `dispatch_messages` table, RLS, Realtime (first use of Supabase
  Realtime in this app — everything else polls). Read receipts are per-message (`read_at`,
  settable only by the non-sender, enforced by trigger) plus a separate "Seen" receipt on the
  dispatch itself (`member_viewed_at`, set via `mark_dispatch_viewed()` RPC when a member opens
  a request's chat). `js/lib/chat.js` is the shared UI, mounted on both `dispatch.html` (owner)
  and `partner.html` (member).
- **Real Web Push notifications**: VAPID keys generated and stored (private key in Supabase
  Vault, public key hardcoded client-side — see §3, item 3). A `send-push` Edge Function,
  triggered by `pg_net` webhooks on `dispatch_messages`/`dispatches` inserts, sends to whichever
  side didn't cause the event, targeted precisely (the dispatch's specific assignee, not every
  support-network member). Service worker has `push`/`notificationclick` handlers;
  `js/lib/push.js` handles subscribing. Opt-in button on Profile (owner) and partner.html
  (member) — not automatic, since browser notification permission has to be a real user gesture.
- **Partner side restructured into two pages**: `partner.html` (Requests, was the whole app)
  and new `partner-timeline.html` (Timeline; only shown/reachable for `full_support_access`
  members). Shared nav + eligibility logic in `js/partner-shared.js`. A member with full access
  can now **add** Timeline memories (own photo upload, compressed client-side like the owner's
  always were) via a new `create_memory_as_support_member()` RPC + a Storage insert policy —
  previously members could only read the owner's Timeline, never contribute to it.
- Chat's open thread lives in a DOM location (`#chat-panel`) that the dispatch list's 20s poll
  never touches, deliberately — an earlier inline-per-card design would have wiped out a
  half-typed message every time the list refreshed.
- Tightened `dispatch_messages`'s UPDATE RLS policy after first-draft review: it originally
  used `using (true)`, relying only on a trigger to stop misuse — the trigger blocked a sender
  from marking their own message read, but didn't stop an unrelated authenticated user from
  touching a message on a dispatch they have nothing to do with, given the id.

**Earlier — expanded support-network access, twice:**
1. First pass: added a permission-level picker to both invite flows
   (`dispatch_recipient` / `full_support_access`), and a new RLS policy
   (`0002_support_member_comfort_access.sql`) so `full_support_access` members can read the
   owner's `comfort_entries`. `partner.html` got a mood/energy section.
2. Second pass: **Timeline photo sync**, the bigger of the two. Built from scratch since photos
   were previously local-only with zero server infrastructure:
   - New private Storage bucket `memories` (3MB file-size cap) + new `memories` table
     (`0003_memories_sync.sql`), RLS mirroring the comfort_entries pattern (owner + accepted
     `full_support_access` members).
   - `js/lib/image-compress.js`: canvas-based client-side compression (max 1600px, JPEG q=0.82)
     before upload — the size cap the account owner asked for.
   - `js/db/memory-store.js` rewritten from local-only to the same offline-first
     cache-then-sync pattern as `dispatch-store.js`/`comfort-store.js`: local IndexedDB is
     still the source of truth for instant/offline display; a compressed copy + metadata row
     also gets pushed to Supabase when online, or queued (`kind: 'memory'`) when not.
   - **Found and fixed a real, unrelated gap while wiring this up**: `sync-queue.js`'s
     `replayQueue()` existed and was already used by `dispatch-store.js`/`comfort-store.js` to
     *enqueue* failed writes, but was never actually *called* anywhere — queued offline writes
     just sat in IndexedDB forever with nothing to replay them. Wired up in `app.js`'s
     `bootPage()` (runs once on boot + on reconnect via `watchConnectivity`). This fixes offline
     retry for dispatches and comfort entries too, not just the new memory sync.
   - `partner.html`/`partner.js` got a Timeline section for `full_support_access` members —
     photos are shown via short-lived signed URLs (the bucket is private), regenerated each
     20s poll.
   - `app.js`'s new-device resume flow (`handleResumeOnNewDevice`) now also pulls down
     memories, so Timeline survives a lost/reset device like the other synced entities.
   - `spec.md` FR-022 + acceptance scenarios updated again to mention Timeline.

**Earlier this session — the same root-cause bug, four times.** This is a GitHub Pages
*project* site (lives at `/RevaPregnancy/`, not domain root); several places assumed root-absolute
paths or `window.location.origin` alone. Watch for this pattern in anything new:
- `inviteLink()` used `window.location.origin` alone → broken invite links → fixed with a
  page-relative base path.
- `manifest.webmanifest`'s `start_url`/`scope` were root-absolute → PWA install 404'd → fixed
  with relative values, and `partner.html` split onto its own manifest (`partner-manifest.
  webmanifest`) so its install target is itself, not the owner's `index.html`.
- Onboarding's "Invite someone now" navigated to `support-network.html`, which enforces the
  disclaimer gate (FR-025) — but invite happens *before* disclaimer per FR-024's step order, so
  it silently bounced back to onboarding's welcome screen. Fixed by building the invite UI
  inline into the onboarding step itself (exempt from the gate).
- (Not the path bug, but related testing note): a few test invites were created and revoked
  within seconds of each other during manual testing — confirmed via direct DB query, not a
  code bug, just worth knowing "Invite someone now" doesn't debounce/disable itself on click.

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
  returning visitors keep seeing stale/broken behavior from cache. Current version: `v9`.
- **Offline write queue is now actually wired up** (`sync-queue.js`'s `replayQueue`, called from
  `app.js`'s `bootPage()`) — see §4. Used by `dispatch`, `comfort`, and `memory` kinds.
  `support-store.js` doesn't use it at all (invite/accept/revoke calls just throw on failure,
  no offline queueing) — that's pre-existing, not something this session touched.
- **Path discipline**: always use paths relative to the current file (`index.html`, not
  `/index.html`; `window.location.pathname`-derived bases, not bare `window.location.origin`) —
  see §4's repeated root-cause pattern. This app is deployed under a subpath; nothing should
  assume it lives at the domain root.
- **What syncs vs. stays local:**
  - Synced via Supabase (Postgres + RLS, plus Storage for memories' photos): dispatches,
    support-network members, comfort entries, Timeline memories.
  - Local-only (IndexedDB, never leaves device): appointments, questions, profile.
  - Timeline photos specifically: the **full-quality original** stays local-only on the device
    that captured it (never uploaded); a **compressed copy** (max 1600px, JPEG q=0.82, capped at
    3MB server-side) is what actually syncs. A device that pulls a memory down via
    `refreshFromServer()` gets the compressed version, not the original.
- **Two "logged in" experiences on the same Supabase project, with a permission split on one:**
  - The pregnant woman: full app, own anonymous session, sees everything she owns, own PWA
    manifest (`manifest.webmanifest`, `start_url: index.html`).
  - An invited support-network member: `partner.html?invite=CODE`, a separate restricted view
    with its own manifest (`partner-manifest.webmanifest`, `start_url: partner.html`). What they
    see depends on the permission level the owner chose at invite time — dispatches only, or
    dispatches + mood/energy + Timeline. Never the full app (appointments/questions/profile stay
    owner-only regardless of level). `partner.js` re-checks the member's own permission level
    from the server on every refresh (not cached), since the owner can change it later via the
    already-existing (if UI-unwired for *changing* an existing member) `updatePermissionLevel()`.
- **RLS is the real security boundary**, not the app code. `supabase/migrations/`:
  `0001_init.sql` (original schema/policies) through `0007_*.sql` (see §6's file map for what
  each does). `supabase/tests/rls-and-transitions.test.js` only covers 0001 (see §3).
- **Almost everything polls every 20s; chat is the one exception.** Chat uses Supabase Realtime
  (`client.channel(...).on('postgres_changes', ...)`, in `subscribeToDispatchMessages()` in
  api-client.js) since a 20s-delayed chat message would feel broken in a way a 20s-delayed
  dispatch status update doesn't. If Realtime ever needs disabling/debugging, the fallback is
  that `js/lib/chat.js`'s `refresh()` still works fine called manually — Realtime is additive,
  not the only way messages arrive.
- **Push notifications have no server of their own to run on** (this app has no custom
  backend/cron) — delivery is entirely event-driven: a Postgres trigger (`pg_net.http_post`)
  fires on relevant inserts, calls the `send-push` Edge Function over HTTP with a shared secret
  (not a user JWT — `verify_jwt: false` on that function, deliberately), which looks up
  `push_subscriptions` and sends via the Web Push protocol (`npm:web-push` inside Deno). VAPID
  private key and the webhook secret live in Supabase Vault, never in this repo or client code
  (see §3, item 3).

---

## 6. File map

```text
public/                      # entire frontend — static, deployable anywhere
  *.html                       # one file per screen (index=Home, comfort, care=Appointment
                                #   Ledger, timeline=Journey feature, support-network, profile,
                                #   onboarding, dispatch=create/view one craving request+chat)
  partner.html                  # member's Requests tab (chat per request, mood/energy summary)
  partner-timeline.html         # member's Timeline tab (full_support_access only; can upload)
  manifest.webmanifest          # owner's PWA manifest (start_url: index.html)
  partner-manifest.webmanifest  # support-network member's PWA manifest (start_url: partner.html)
  css/tokens.css                # design tokens ("Modern Nurturing": sage green + dusty rose)
  css/base.css, components.css  # resets + reusable component classes (incl. .chat-bubble etc.)
  js/api-client.js              # all Supabase calls (Postgres + Storage + Realtime), lazy, fail-soft
  js/app.js                     # shared boot: bottom nav, disclaimer gate, a11y prefs, session,
                                 #   new-device resume, offline sync-queue wiring
  js/identity.js                # resolves current Supabase Auth identity
  js/partner-shared.js          # member-side nav + eligibility checks (partner.html/-timeline.html)
  js/lib/image-compress.js      # canvas-based photo compression before Storage upload
  js/lib/chat.js                # shared chat UI, mounted on dispatch.html AND partner.html
  js/lib/push.js                # Web Push subscribe/unsubscribe helper
  js/db/                        # one IndexedDB/localStorage + sync module per entity
  js/models/                    # pure factory/validation functions, no I/O
  js/views/                     # one controller module per page
  service-worker.js             # offline app-shell caching + push/notificationclick, CACHE_NAME v12

supabase/functions/send-push/index.ts   # Web Push sender, invoked by pg_net webhooks (Deno)

supabase/migrations/
  0001_init.sql                            # schema + RLS + status trigger + accept_invite() RPC
  0002_support_member_comfort_access.sql   # RLS: full_support_access members read comfort_entries
  0003_memories_sync.sql                   # memories table + Storage bucket + RLS
  0004_accept_invite_resumable.sql         # accept_invite() resumes non-revoked, not pending-only
  0005_chat_and_push_notifications.sql     # dispatch_messages, push_subscriptions, member memory
                                            #   uploads, pg_net webhook wiring (secrets NOT included)
  0006_push_secrets_rpc.sql                # locked-down RPC the edge function uses to read Vault
  0007_dispatch_messages_update_policy_fix.sql   # tightened an overly-permissive RLS policy
supabase/tests/                      # RLS/transition tests — only covers 0001 (see §3)
tests/unit/*.test.html               # browser-run assertion pages, open directly

specs/001-crave-and-care-mvp/        # spec, plan, data model, API contract, tasks (Spec Kit) —
                                      #   spec.md covers permission tiers/Timeline sharing but NOT
                                      #   chat/push/member-uploads yet (this session's work isn't
                                      #   reflected in spec.md — a gap worth closing);
                                      #   data-model.md/tasks.md/quickstart.md are all stale
.github/workflows/deploy-pages.yml   # GitHub Pages CI/CD, triggers on push to main
```

---

## 7. If you're a fresh Claude session picking this up

1. **Check §3** for currently-known open items before assuming something's broken or working.
2. **Deploys are automatic** on push to `main` — no separate "deploy" step needed, just commit and
   push, then check the Actions tab (or ask whoever's testing to hard-refresh / fully close and
   reopen the tab, since the service worker caches aggressively).
3. **Don't add a framework or CDN dependency** without checking — this is a deliberate
   architectural constraint (see §5), not an oversight.
4. **Watch for the root-absolute-path bug pattern** (§4) in anything new — it's bitten this
   project multiple times already.
5. **Multiple people test this app** (the account owner, plus whoever they've invited — e.g. a
   partner, a parent). Confirm who you're talking to before making account/architecture-level
   decisions, and don't assume a phone described in conversation belongs to the account owner.
6. **A likely next ask**: letting the owner change an *existing* member's permission level from
   the Support Network screen — the backend function (`updatePermissionLevel()`) already exists
   and is unused; only the UI to call it is missing.
7. Full task-by-task build history: `specs/001-crave-and-care-mvp/tasks.md` (stale, see §1).
   Manual QA walkthrough for all five *original* stories: `specs/001-crave-and-care-mvp/
   quickstart.md` (also stale — doesn't cover permission tiers or Timeline sync).
