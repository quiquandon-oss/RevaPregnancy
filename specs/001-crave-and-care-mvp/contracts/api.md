# Backend Contract: Crave & Care Sync (Supabase)

Scope reminder: this contract exists **only** for the three entities that sync through Supabase
(`CravingDispatch`, `SupportNetworkMember`, `DailyComfortEntry`) plus the optional account-linking
flow (FR-031). Appointments, questions, and the rest of the profile never talk to Supabase — it's
local-only.

There is no hand-written server here. The frontend talks to Supabase's auto-generated REST API
through the `supabase-js` client library (loaded as a plain ES module, no build step). Every
table read/write is authorized by Postgres Row Level Security (RLS) using the caller's Supabase
Auth session (`auth.uid()`) — anonymous by default, the same identity after an optional email
link — see `research.md` #4 and #8 and `data-model.md`. This document describes the *shape* of
those calls, not literal HTTP routes to implement by hand.

## Session bootstrap (every page load)

```js
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  await supabase.auth.signInAnonymously();
}
```
`supabase-js` persists the resulting session in `localStorage` automatically — there's no token
or header we manage ourselves. From here, every call below is automatically scoped to this
session's `auth.uid()` by RLS; the frontend never needs to pass "who am I" explicitly.

## Dispatches

### Create a dispatch
Caller must be the owning user's session.

```js
const { data, error } = await supabase
  .from('dispatches')
  .insert({
    category: 'salty',
    item_name: 'pickled mango',
    intensity: 4,
    fulfiller: 'support_member',
    assigned_member_id: 'sm-uuid',
  })
  .select()
  .single();
```
RLS's insert policy sets `owner_id = auth.uid()` automatically (via a default/trigger, not a
client-supplied field — the client cannot claim a dispatch on someone else's behalf) and rejects
the insert if `assigned_member_id` isn't an `accepted` member owned by the caller. When
`fulfiller = 'self'`, the insert policy/trigger creates the row directly with `status =
'delivered'` (see data-model.md).

### List dispatches relevant to the caller

```js
// As the owner:
const { data } = await supabase.from('dispatches').select('*').eq('owner_id', myUid);

// As an assigned support-network member (their own view, partner.html):
const { data } = await supabase.from('dispatches').select('*').eq('assigned_member_id', myMemberRowId);
```
RLS ensures a caller only ever gets rows they're actually allowed to see, regardless of the
filter used — these `.eq()` calls are for efficiency, not security.

### Advance or cancel a dispatch's status

```js
const { data, error } = await supabase
  .from('dispatches')
  .update({ status: 'on_the_way' })
  .eq('id', dispatchId)
  .select()
  .single();
```
A `BEFORE UPDATE` trigger rejects any transition outside the allowed state machine
(`data-model.md`) regardless of caller. RLS's update policy separately rejects the call entirely
(`error.code` reflecting a permissions failure) unless the caller is the dispatch's owner
(only allowed to move to `cancelled`) or its assigned member (only allowed to move forward one
step along `accepted → on_the_way → delivered`).

## Support Network

### Create an invite
Caller becomes the invite's owner.

```js
const { data } = await supabase
  .from('support_network_members')
  .insert({ permission_level: 'dispatch_recipient' })
  .select()
  .single();
// data.invite_code, e.g. "warm-otter-42"
```
The frontend turns `invite_code` into a shareable link (e.g.
`/partner.html?invite=warm-otter-42`) — a client-only concern. Actual delivery (SMS/email) is
simulated per FR-023 and out of scope here.

### Accept an invite
No prior session state assumed beyond having just called `signInAnonymously()` — this is how a
support-network member's device gets its own identity in the first place.

```js
const { data, error } = await supabase.rpc('accept_invite', {
  invite_code: 'warm-otter-42',
  display_name: 'Sam',
});
// data: { id, status: 'accepted' }
```
`accept_invite` is a `SECURITY DEFINER` Postgres function so it can look up the invite by code
(which the caller's own RLS wouldn't otherwise permit before they're linked to it) and stamps
`member_auth_id = auth.uid()` for the *calling* session — it cannot be used to claim an invite on
someone else's behalf. Returns an error (surfaced via `error.message`) for an unknown/expired
code or one already `revoked`.

### List the caller's own support-network members

```js
const { data } = await supabase.from('support_network_members').select('*').eq('owner_id', myUid);
```
Includes `pending` invites not yet accepted.

### Revoke access or change permission level
Owner-only; enforced by RLS's update policy (`owner_id = auth.uid()`).

```js
await supabase.from('support_network_members').update({ status: 'revoked' }).eq('id', memberId);
// or:
await supabase.from('support_network_members').update({ permission_level: 'full_support_access' }).eq('id', memberId);
```
A `revoked` status takes effect immediately — every subsequent request from that member's session
is re-checked against the current row state by RLS, so there's no separate propagation step
(FR-021).

## Comfort Entries

Owner-only — there is no assignee/sharing concept for this table (comfort data is never visible
to a support-network member).

### Set/update today's entry (upsert by date)

```js
const { data, error } = await supabase
  .from('comfort_entries')
  .upsert({ date: '2026-08-16', energy_level: 'moderate' }, { onConflict: 'owner_id,date' })
  .select()
  .single();
```
RLS's insert/update policies restrict this to `owner_id = auth.uid()`, set automatically the same
way as dispatches — the client never supplies `owner_id` itself.

### Add or update a comfort status within today's entry

```js
const { data: existing } = await supabase.from('comfort_entries').select('*').eq('date', '2026-08-16').single();
const statuses = [...(existing?.statuses ?? []), { id: crypto.randomUUID(), label: 'Needs Lower Back Relief', source: 'curated', addressed: false, loggedAt: new Date().toISOString() }];
await supabase.from('comfort_entries').update({ statuses }).eq('id', existing.id);
```
The `statuses` array is stored as a single `jsonb` column (data-model.md) — read-modify-write from
the client, no separate table/endpoint needed for individual status entries.

### List recent entries (e.g. for a history view, or right after linking an account on a new device)

```js
const { data } = await supabase.from('comfort_entries').select('*').order('date', { ascending: false }).limit(30);
```

## Account Linking (optional, FR-031)

Triggered only when the user chooses "back up my account" in Profile — never during onboarding,
never required.

### Link an email to the current (anonymous) session

```js
const { data, error } = await supabase.auth.updateUser({ email: 'she@example.com' });
```
Supabase sends a confirmation link to that email. The local `User` profile's `linkedEmail`/
`emailLinkedAt` fields (data-model.md) are set once the confirmation completes (detected via
`supabase.auth.onAuthStateChange`, since confirming the link updates the current session in
place — `auth.uid()` does not change).

### Resume the same profile on a second device

```js
const { error } = await supabase.auth.signInWithOtp({ email: 'she@example.com' });
// user clicks the emailed link, which completes the sign-in on that device
```
This signs the second device into the *same* `auth.uid()` as the original device, so every query
above (dispatches, support-network members, comfort entries) now returns that same data. The
local `User` profile fields (name, due date, etc.) are not stored server-side, so the app must
re-collect or re-derive a local profile shell on first load after this sign-in — the Supabase-held
data itself is what makes the experience feel "resumed."

## Error shape

`supabase-js` calls return `{ data, error }`. On failure, `error.message` is a Postgres/PostgREST
message — the frontend rephrases it into the app's non-judgmental tone (per constitution
Principle I) rather than surfacing raw database errors to the user; it never blocks on a
technical error type the UI doesn't recognize (falls back to a generic, gentle "that didn't quite
go through — want to try again?" message).
