# Crave & Care — Handoff / Continuation Notes

**Purpose of this file:** paste this into a fresh Claude chat (claude.ai) to pick up exactly
where this session left off, without needing to re-explain the project. It covers what the app
is, what's live, what's broken, and what to do next.

Last updated: 2026-08-16, commit `df5bf5d` on branch `main`.

---

## 1. What this is

**Crave & Care** is a calm, supportive pregnancy-companion PWA. No signup required for the
pregnant person or the people she invites to help. Five core features:

1. **Instant Craving Dispatch** — tap a category (salty/sweet/sour/etc.), send a request to
   yourself or a support-network member, track status (requested → accepted → on the way →
   delivered).
2. **Comfort & Energy Check-in** — daily energy level + symptom/status tracking.
3. **Appointment Prep** — appointment ledger with prep checklists and a running question list.
4. **Support Network** — invite a partner/friend via a link (no account needed on their end);
   they get a restricted view showing only what's been asked of them.
5. **Onboarding & Profile** — name/due date, disclaimer, optional email-based account linking for
   cross-device resume.

Plus, added in this latest session:

6. **Full Journey Timeline** — a photo/ultrasound/milestone journal, local-only (never leaves the
   device — see §6).
7. **WhatsApp invite sharing** — one-tap "Send via WhatsApp" button next to the invite link.

Built via the [GitHub Spec Kit](https://github.com/github/spec-kit) workflow
(constitution → specify → plan → tasks → analyze → implement). All artifacts live in
`specs/001-crave-and-care-mvp/` (spec.md, plan.md, data-model.md, contracts/api.md,
quickstart.md, tasks.md — 64 tasks, all complete).

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
  does the real access control).

---

## 3. ⚠️ Known blocker — read this first

**Anonymous Sign-Ins are still disabled on the Supabase project.** This blocks almost everything
that needs a session: creating a support-network invite, and (once synced) dispatches/comfort
history. Confirmed directly from the project's auth logs — every `/signup` (anonymous sign-in)
attempt fails with:

```
422: Anonymous sign-ins are disabled
error_code: anonymous_provider_disabled
```

Zero users have ever been created on this project (`select count(*) from auth.users` → 0), which
means this has never actually been successfully turned on, despite it looking toggled-on in past
conversations with the account owner.

**Fix** (dashboard-only, no CLI/API way to do this — a real person with project access has to
click it):
1. Go to `https://supabase.com/dashboard/project/zwxfmdhgnlhtkixfkdob/auth/providers`
2. Find **Anonymous Sign-Ins**, toggle it **on**.
3. Look for an explicit **Save** — this is the step that's easy to miss and silently reverts if
   skipped.
4. Refresh the settings page and confirm the toggle still shows on.
5. Verify by checking `auth.users` — a successful anonymous sign-in from the live app should
   produce a new row.

Until this is fixed, "Invite someone" (and anything else touching Supabase) will show the gentle
error message added in commit `a7d9646`: *"That didn't go through — check your connection and
try again in a moment."* That message is accurate-but-vague on purpose (see next section); the
real cause is always worth checking against the auth logs first.

---

## 4. Recent debugging history (this session)

1. User (account owner) reported "add a contact" not working. Traced to two independent issues:
   - **Code bug** (fixed, commit `a7d9646`): the invite-creation button had no error handling at
     all — any failure produced zero user feedback. Now shows a gentle error message.
   - **Infra issue** (still open, see §3): Anonymous Sign-Ins disabled server-side.
2. A second person — the invited "contact" (support-network member), not the account owner —
   joined the conversation reporting a GitHub 404 when opening a link received via WhatsApp.
   Root cause: WhatsApp-forwarded links had gotten case-mangled/truncated; the real URL (§2)
   worked fine when typed fresh. Not a code or infra bug — just a URL-transcription trap worth
   knowing about.
3. That contact then requested, with the account owner's live sign-off: a Full Journey Timeline
   feature (from a Tailwind/Google-Fonts-CDN mockup they pasted) and WhatsApp share for invites.
   Both were built — see commit `df5bf5d` — but the Timeline visuals were **rebuilt using the
   existing local CSS token system** rather than the pasted Tailwind/CDN code, to preserve the
   app's offline-first requirement (a CDN-dependent page would go blank with no signal).

---

## 5. Architecture essentials

- **Zero build step.** Plain HTML + CSS + vanilla JS (ES modules). No framework, no bundler. This
  was an explicit, deliberate choice early in the project — don't introduce React/Vue/Tailwind/a
  bundler/etc. without re-confirming that's actually wanted.
- **Offline-first.** The app must work with zero network the moment it's opened. Supabase calls
  are lazy dynamic imports wrapped so they never throw synchronously (`api-client.js`'s
  `withClient()`), and `bootPage()` never awaits network calls. A service worker
  (`service-worker.js`, stale-while-revalidate) precaches the full app shell — bump `CACHE_NAME`
  whenever `CORE_ASSETS` changes, or returning visitors keep seeing a stale mixed cache.
- **What syncs vs. stays local:**
  - Synced via Supabase (Postgres + RLS): dispatches, support-network members, comfort entries.
  - Local-only (IndexedDB, never leaves device): appointments, questions, profile, and the new
    Timeline memories (photos can be large; syncing them wasn't in scope for this pass).
- **Two very different "logged in" experiences on the same Supabase project:**
  - The pregnant woman: full app, own anonymous session, sees everything she owns.
  - An invited support-network member: `partner.html?invite=CODE`, a completely separate,
    restricted view — only their assigned dispatches, no access to anything else. This is already
    built; it just hasn't been reachable end-to-end because of the §3 blocker.
- **RLS is the real security boundary**, not the app code. See
  `supabase/migrations/0001_init.sql` for policies; `supabase/tests/rls-and-transitions.test.js`
  exercises them against a real Postgres instance (needs `supabase start`, i.e. Docker — see
  README for local dev).

---

## 6. File map

```text
public/                      # entire frontend — static, deployable anywhere
  *.html                       # one file per screen (index=Home, comfort, care=Appointment
                                #   Ledger, timeline=new Journey feature, support-network,
                                #   partner=invited-member view, profile, onboarding)
  css/tokens.css                # design tokens ("Modern Nurturing": sage green + dusty rose)
  css/base.css, components.css  # resets + reusable component classes
  js/api-client.js              # all Supabase calls, lazy-loaded, fail-soft
  js/app.js                     # shared boot: bottom nav, disclaimer gate, a11y prefs, session
  js/identity.js                # resolves current Supabase Auth identity
  js/db/                        # one IndexedDB/localStorage store module per entity
  js/models/                    # pure factory/validation functions, no I/O
  js/views/                     # one controller module per page
  service-worker.js             # offline app-shell caching

supabase/migrations/0001_init.sql   # schema + RLS + status trigger + accept_invite() RPC
supabase/tests/                      # RLS/transition tests (node --test, needs local Supabase)
tests/unit/*.test.html               # browser-run assertion pages, open directly

specs/001-crave-and-care-mvp/        # spec, plan, data model, API contract, tasks (Spec Kit)
.github/workflows/deploy-pages.yml   # GitHub Pages CI/CD, triggers on push to main
```

---

## 7. If you're a fresh Claude session picking this up

1. **Check §3 first** — has Anonymous Sign-Ins actually been turned on yet? If you have Supabase
   MCP tools available, query `select count(*) from auth.users` — if it's still 0, nothing
   downstream of auth will work regardless of what else you fix.
2. **Deploys are automatic** on push to `main` — no separate "deploy" step needed, just commit and
   push, then check the Actions tab (or ask the account owner to hard-refresh / open the URL
   fresh, since the service worker caches aggressively).
3. **Don't add a framework or CDN dependency** without checking — this is a deliberate
   architectural constraint (see §5), not an oversight.
4. **The account owner and the invited contact are different people** who may both show up in
   conversation. Confirm who you're talking to before making account/architecture-level decisions
   — this bit the previous session (see §4.3) and is worth a quick clarifying question rather than
   assuming.
5. Full task-by-task build history: `specs/001-crave-and-care-mvp/tasks.md`. Manual QA walkthrough
   for all five original stories: `specs/001-crave-and-care-mvp/quickstart.md`.
