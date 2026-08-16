# Phase 1 Data Model: Crave & Care MVP

Entities are grouped by where they live, per the plan's simplicity-first split: most data stays
entirely on-device; only the two entities that must be visible across two people's devices are
also mirrored on the server.

## Client-only entities (IndexedDB / localStorage — never sent to the server)

### User (localStorage, singleton)
Represents the pregnant individual using this installation of the app.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | Generated on first run |
| `name` | string | Set during onboarding |
| `dueDate` | date, nullable | Either this or `currentWeek` is set |
| `currentWeek` | integer 1-42, nullable | Alternative to `dueDate` |
| `notificationPrefs` | object | `{ dispatchUpdates: bool, comfortReminders: bool }` |
| `disclaimerAcknowledgedAt` | timestamp, nullable | Set once; gates first use per FR-025 |
| `pregnancySafeNotesEnabled` | boolean, default `false` | FR-008; off by default |
| `deviceToken` | string | Locally-generated identity sent to the server API (research.md #4) |
| `createdAt` | timestamp | |

**Validation**: `name` non-empty. Exactly one of `dueDate`/`currentWeek` must be set. Onboarding
cannot be considered complete (app should not leave the disclaimer step) until
`disclaimerAcknowledgedAt` is set.

### DailyComfortEntry (IndexedDB)
One day's comfort record. One record per calendar date.

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `date` | string (YYYY-MM-DD) | Unique per install — FR-010 |
| `energyLevel` | enum: `low` \| `moderate` \| `full`, nullable | Nullable until first set that day |
| `statuses` | array of `ComfortStatusEntry` | See below |
| `updatedAt` | timestamp | |

**ComfortStatusEntry** (embedded, not a separate table):

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) | |
| `label` | string | e.g. "Needs Lower Back Relief" |
| `source` | enum: `curated` \| `custom` | FR-011 |
| `addressed` | boolean, default `false` | FR-012 |
| `loggedAt` | timestamp | |

**Validation**: `date` required, one entry per date (upsert on same date). `label` non-empty for
custom statuses.

**State transitions**: `addressed` toggles `false → true` (and back, so a user can undo). No
other lifecycle.

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

## Server-synced entities (Cloudflare D1 — source of truth; cached locally for offline reads)

These two entities are the exception carved out in the plan's Complexity Tracking: they need to
be visible and actionable from two different people's devices, so the server is authoritative and
each device keeps a local read-cache plus an offline write-queue (research.md #5).

### CravingDispatch (D1 table `dispatches`, cached in IndexedDB)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid), PK | |
| `owner_device_token` | string | The requesting user's device token — FR-001 |
| `category` | string | Salty / Sweet / Sour / Cold Drink / Fresh Fruit / Specific Snack |
| `item_name` | string, nullable | Free-text note |
| `intensity` | integer 1-5 | |
| `fulfiller` | enum: `self` \| `support_member` | FR-002 |
| `assigned_member_id` | string, nullable, FK → `support_network_members.id` | Set only when `fulfiller = support_member` |
| `status` | enum: `requested` \| `accepted` \| `on_the_way` \| `delivered` \| `cancelled` | FR-003 |
| `requested_at` | timestamp | |
| `status_updated_at` | timestamp | |

**Validation**: If `fulfiller = support_member`, `assigned_member_id` is required and must
reference an `accepted` `SupportNetworkMember` belonging to the same owner. If `fulfiller =
self`, the dispatch is created directly in `delivered` status (no one else needs to act; it's
just a log entry) — see Edge Cases in spec.md for the "self" path.

**State transitions** (FR-003, FR-004):

```
requested → accepted → on_the_way → delivered
requested → cancelled
accepted  → cancelled
```
No transition is valid out of `delivered` or `cancelled` (terminal states). Only the dispatch's
`owner_device_token` may cancel; only the `assigned_member_id`'s device token may advance
`accepted`/`on_the_way`/`delivered`.

### SupportNetworkMember (D1 table `support_network_members`, cached in IndexedDB)

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid), PK | |
| `owner_device_token` | string | The inviting user |
| `display_name` | string, nullable | Set by the invitee on accept — FR-020 |
| `permission_level` | enum: `dispatch_recipient` \| `full_support_access` | FR-019; MVP UI only exposes `dispatch_recipient`, schema allows room to grow |
| `invite_code` | string, unique | Shareable link/code — FR-019 |
| `member_device_token` | string, nullable | Set once the invite is accepted; identifies the invitee's device |
| `status` | enum: `pending` \| `accepted` \| `revoked` | |
| `invited_at` / `accepted_at` / `revoked_at` | timestamp, nullable | |

**Validation**: `invite_code` unique and unguessable (random, sufficient entropy). A `pending`
invite has no `member_device_token` yet.

**State transitions** (FR-020, FR-021):

```
pending → accepted   (invitee opens the link/code)
pending → revoked    (inviter revokes before anyone accepted)
accepted → revoked   (inviter revokes active access — takes effect immediately, FR-021)
```
`revoked` is terminal; a revoked member's `member_device_token` immediately loses API access to
that owner's dispatches (enforced server-side on every request, not just hidden client-side).

## Entity relationship summary

```
User (local only, 1 per install)
  │  owns (by device token, not a DB foreign key)
  ├── DailyComfortEntry (local, many, 1 per date)
  ├── Appointment (local, many)
  │      └── ChecklistItem (embedded, many)
  ├── Question (local, many — independent of Appointment)
  ├── SupportNetworkMember (server, many)
  └── CravingDispatch (server, many)
         └── assigned_member_id → SupportNetworkMember (nullable)
```
