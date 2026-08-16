# Crave & Care

A calm, supportive companion app for pregnant individuals — instant craving dispatch to a
partner or support network, simple energy & comfort tracking, and an appointment ledger with
prep checklists and a running list of questions to ask your provider.

Built with [GitHub Spec Kit](https://github.com/github/spec-kit). See
`.specify/memory/constitution.md` for the project's ground rules and
`specs/001-crave-and-care-mvp/` for the full spec, plan, data model, API contract, and task
breakdown behind this build.

## Tech stack

Plain HTML, CSS, and vanilla JavaScript (ES modules) — no framework, no bundler, no build step.
The only exception is a minimal Supabase (hosted Postgres) backend for the three things that
need to sync across devices: craving dispatches, support-network invites, and comfort/energy
history (see `specs/001-crave-and-care-mvp/research.md` for why). Everything else — appointments,
questions, your profile — stays entirely on your own device.

## Running it locally

**Frontend** (no install needed):

```bash
npx serve public
# or: python3 -m http.server --directory public 8080
```

Open the printed URL. Editing any file under `public/` and reloading is enough to see the
change — there's no build/watch step.

**Backend** (only needed to exercise dispatch/invite/comfort syncing locally):

```bash
npm install               # installs `pg`, used only by the backend test suite
npm run supabase:start    # boots local Postgres + Auth + the generated REST API (needs Docker)
npm run supabase:reset    # applies supabase/migrations/0001_init.sql
```

`supabase start` prints a local URL and anon key — paste them into the two constants at the top
of `public/js/api-client.js`.

**Tests**:

```bash
npm run test:backend                       # RLS + status-transition tests (needs supabase:start)
# tests/unit/*.test.html — open directly in a browser
```

See `specs/001-crave-and-care-mvp/quickstart.md` for the full manual validation walkthrough
covering all five user stories.

## Design tokens — "Modern Nurturing"

Defined as CSS custom properties in `public/css/tokens.css`.

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#8fae8b` (sage green) | Active states, energy slider, accents |
| `--color-primary-dark` | `#5a7a57` | Filled buttons, pressed/hover states (chosen over the lighter `--color-primary` for filled buttons specifically so white text clears WCAG AA contrast) |
| `--color-secondary` | `#d4a5a5` (dusty rose) | Category icon backgrounds |
| `--color-secondary-soft` | `#f5e6e6` | Soft pill/icon backgrounds |
| `--color-tertiary` | `#f5f2ed` | Page background |
| `--color-neutral-dark` / `-mid` / `-light` | `#4a4a4a` / `#6f6f6f` / `#e8e4df` | Text, borders |
| `--color-accent-purple` | `#7a6cc0` | Appointment card accent |
| `--font-display` | Playfair Display / Cormorant Garamond | Headings |
| `--font-body` | Inter / Source Sans 3 | Body text |
| `--space-1` … `--space-12` | 4px-based scale | Spacing |
| `--radius-card` / `--radius-pill` / `--radius-icon-button` | 22px / full / 16px | Corner radii |
| `--touch-target-min` | 48px | Minimum interactive element size |

Two accessibility modes layer on top via `data-motion="reduced"` and `data-contrast="high"` on
`<html>`, toggled from Profile.

## Component inventory (`public/css/components.css`)

`.card`, `.btn` (`-primary` / `-outline` / `-danger`, `-block`), `.icon-btn`, `.category-grid` /
`.category-card`, `.status-banner`, `.status-pill`, `.segmented` (energy slider / intensity
picker), `.status-row` (expandable comfort status), `.checklist-item`, `.bottom-nav`, `.field`.

## Project structure

```text
public/          # The entire frontend — static files, deployable anywhere
  *.html           # One file per screen
  css/             # tokens.css (design system) + base.css + components.css
  js/
    api-client.js    # Supabase calls (lazy-loaded, never blocks offline use)
    app.js           # Shared boot: nav, disclaimer gate, accessibility prefs, session
    identity.js      # Resolves the current Supabase Auth identity
    db/              # IndexedDB/localStorage stores — one per entity, offline-first
    models/          # Pure factory/validation functions, no I/O
    data/            # Static content (curated comfort statuses)
    views/           # One controller module per page
  service-worker.js # Offline app-shell caching

supabase/
  migrations/0001_init.sql   # Schema + RLS policies + status trigger + accept_invite() RPC
  tests/                      # RLS/transition tests (node --test, needs a local Supabase)

tests/unit/        # Browser-run assertion pages for models/ and local-store logic

specs/001-crave-and-care-mvp/   # Spec, plan, data model, API contract, tasks
```

## Status

All five MVP user stories (instant craving dispatch, comfort & energy check-in, appointment
prep, support-network invites, onboarding & profile) are implemented per
`specs/001-crave-and-care-mvp/tasks.md`. See that file for the full task-by-task record, and
`quickstart.md` for how to validate each story by hand.
