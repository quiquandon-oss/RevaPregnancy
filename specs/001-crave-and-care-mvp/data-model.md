# Phase 1 Data Model: Crave & Care MVP

Entities are grouped by where they live. Appointments and questions stay entirely on-device.
Craving dispatches, support-network members, and comfort/energy entries are all also mirrored on
the server (Supabase) — see the "Server-synced entities" section below for why each one needs
that.

## Client-only entities (IndexedDB / localStorage — never sent to the server)

### User (localStorage, singleton)
Represents the pregnant individual using this installation of the app. Her profile fields stay
local; only her Supabase Auth identity (anonymous by default, optionally linked to an email) is
what ties her to the server-synced entities below — see research.md #4 and #8.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Generated on first run, local profile record id |
| `name` | string | Set during onboarding |
| `dueDate` | date, nullable | Either this or `currentWeek` is set |
| `currentWeek` | integer 1-42, nullable | Alternative to `dueDate` |
| `notificationPrefs` | object | `{ dispatchUpdates: bool, comfortReminders: bool }` |
| `disclaimerAcknowledgedAt` | timestamp, nullable | Set once; gates first use per FR-025 |
| `pregnancySafeNotesEnabled` | boolean, default `false` | FR-008; off by default |
| `linkedEmail` | string, nullable | Set once she completes the optional email-link flow — FR-031 |
| `emailLinkedAt` | timestamp, nullable | |
| `createdAt` | timestamp | |

**Validation**: `name` non-empty. Exactly one of `dueDate`/`currentWeek` must be set. Onboarding
cannot be considered complete (app should not leave the disclaimer step) until
`disclaimerAcknowledgedAt` is set. `linkedEmail` is never required for any other field or feature
to function (FR-031).

**Note**: the underlying Supabase Auth session (anonymous, or email-linked once FR-031 is used)
is managed by `supabase-js` itself, persisted in `localStorage` under its own key — it is not a
field on this local `User` profile record.

### Appointment (IndexedDB)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `title` | string | e.g. "20-week ultrasound" |
| `type` | string | Free text/select, e.g. "OB-GYN checkup" — FR-014 |
| `datetime` | timestamp | |
| `location` | string, nullable | |
| `checklist` | array of `ChecklistItem` | Starts empty — FR-016 |
| `createdAt` / `updatedAt` | timestamp | |

**ChecklistItem** (embedded):

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `label` | string | |
| `completed` | boolean, default `false` | |

**Validation**: `title` and `datetime` required. `checklist` may be empty.

**Derived**: "Next Visit" = the `Appointment` with the soonest `datetime` that is still in the
future at read time (FR-015) — not a stored field, computed on read.

### Question (IndexedDB)
Not tied to a single appointment — persists independently (FR-017).

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `text` | string | |
| `asked` | boolean, default `false` | |
| `createdAt` | timestamp | |

**Validation**: `text` non-empty.

**Derived**: "Ready for your visit" summary (FR-018) = for the current Next Visit, all
`ChecklistItem`s with `completed = false` plus all `Question`s with `asked = false`, computed on
read — not a stored relationship.

## Server-synced entities (Supabase Postgres — source of truth; cached locally for offline reads)

`CravingDispatch` and `SupportNetworkMember` sync because they must be visible and actionable
from two different people's devices. `DailyComfortEntry` syncs for a different reason — per
product-owner decision, so a user's comfort/energy history survives losing her device and can be
reached from a second device once she optionally links an email (FR-031) — but only ever to
*her own* account; it is never shared with a support-network member. All three keep a local
read-cache plus an offline write-queue (research.md #5) so logging still works with no
connection. Every row's owner/assignee is identified by a Supabase Auth `auth.uid()` — anonymous
by default, the same identity after an optional email link (research.md #4, #8) — not a
hand-rolled token; Row Level Security policies enforce who may read or write each row.

### DailyComfortEntry (Postgres table `comfort_entries`, cached in IndexedDB)
One day's comfort record. One record per calendar date per user.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid, FK → `auth.users.id` | FR-010; owner-only, never shared with support-network members |
| `date` | date | Unique per `owner_id` — FR-010 |
| `energy_level` | enum: `low` \| `moderate` \| `full`, nullable | Nullable until first set that day |
| `statuses` | jsonb array of `ComfortStatusEntry` | See below |
| `updated_at` | timestamptz | |

**ComfortStatusEntry** (embedded in the `statuses` jsonb column, not a separate table):

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `label` | string | e.g. "Needs Lower Back Relief" |
| `source` | enum: `curated` \| `custom` | FR-011 |
| `addressed` | boolean, default `false` | FR-012 |
| `loggedAt` | timestamp | |

**Validation**: `(owner_id, date)` unique — upsert on conflict. `label` non-empty for custom
statuses.

**State transitions**: `addressed` toggles `false → true` (and back, so a user can undo). No
other lifecycle. RLS restricts all access to `owner_id = auth.uid()` — no assignee/sharing
concept exists for this table.

### CravingDispatch (Postgres table `dispatches`, cached in IndexedDB)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid, FK → `auth.users.id` | The requesting user's anonymous-auth identity — FR-001 |
| `category` | text | Salty / Sweet / Sour / Cold Drink / Fresh Fruit / Specific Snack |
| `item_name` | text, nullable | Free-text note |
| `intensity` | smallint, 1-5 | |
| `fulfiller` | enum: `self` \| `support_member` | FR-002 |
| `assigned_member_id` | uuid, nullable, FK → `support_network_members.id` | Set only when `fulfiller = support_member` |
| `status` | enum: `requested` \| `accepted` \| `on_the_way` \| `delivered` \| `cancelled` | FR-003 |
| `requested_at` | timestamptz | |
| `status_updated_at` | timestamptz | |

**Validation**: If `fulfiller = support_member`, `assigned_member_id` is required and must
reference an `accepted` `SupportNetworkMember` belonging to the same owner (enforced by a check in
the insert RLS policy). If `fulfiller = self`, the dispatch is created directly in `delivered`
status (no one else needs to act; it's just a log entry) — see Edge Cases in spec.md for the
"self" path.

**State transitions** (FR-003, FR-004):

```
requested → accepted → on_the_way → delivered
requested → cancelled
accepted  → cancelled
```
No transition is valid out of `delivered` or `cancelled` (terminal states). Enforced by a
`BEFORE UPDATE` Postgres trigger that rejects any other transition. Row Level Security separately
restricts *who* may attempt an update: only `owner_id = auth.uid()` may set `cancelled`; only the
row's `assigned_member_id`'s linked auth identity (via `support_network_members.member_auth_id`)
may advance `accepted`/`on_the_way`/`delivered`.

### SupportNetworkMember (Postgres table `support_network_members`, cached in IndexedDB)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `owner_id` | uuid, FK → `auth.users.id` | The inviting user |
| `display_name` | text, nullable | Set by the invitee on accept — FR-020 |
| `permission_level` | enum: `dispatch_recipient` \| `full_support_access` | FR-019; MVP UI only exposes `dispatch_recipient`, schema allows room to grow |
| `invite_code` | text, unique | Shareable link/code — FR-019 |
| `member_auth_id` | uuid, nullable, FK → `auth.users.id` | Set once the invite is accepted; the invitee's anonymous-auth identity |
| `status` | enum: `pending` \| `accepted` \| `revoked` | |
| `invited_at` / `accepted_at` / `revoked_at` | timestamptz, nullable | |

**Validation**: `invite_code` unique and unguessable (random, sufficient entropy). A `pending`
invite has no `member_auth_id` yet. Claiming an invite happens through the `accept_invite(code,
display_name)` RPC function (SECURITY DEFINER), not a raw table update, so the claim is atomic
and stamps the *caller's own* `auth.uid()` — a client can't claim an invite on someone else's
behalf.

**State transitions** (FR-020, FR-021):

```
pending → accepted   (invitee opens the link/code and calls accept_invite())
pending → revoked    (inviter revokes before anyone accepted)
accepted → revoked   (inviter revokes active access — takes effect immediately, FR-021)
```
`revoked` is terminal; because every dispatch/support-network read and write is RLS-checked
against the *current* row state on every request, a revoked member's session immediately loses
access — there's no separate "revocation propagation" step to get wrong.

## Entity relationship summary

```
User (local profile, 1 per install; auth.uid() from Supabase Auth ties it to the server —
      anonymous by default, or email-linked once FR-031 is used)
  │
  ├── Appointment (local, many)
  │      └── ChecklistItem (embedded, many)
  ├── Question (local, many — independent of Appointment)
  ├── DailyComfortEntry (Supabase, many, 1 per date) — owner_id = User's auth.uid(), owner-only
  ├── SupportNetworkMember (Supabase, many) — owner_id = User's auth.uid()
  └── CravingDispatch (Supabase, many) — owner_id = User's auth.uid()
         └── assigned_member_id → SupportNetworkMember (nullable)
```
