# Backend Contract: Crave & Care Sync (Supabase)

Scope reminder: this contract exists **only** for the two entities that must sync across two
people's devices (`CravingDispatch`, `SupportNetworkMember`). Everything else in the app
(comfort entries, appointments, questions, profile) never talks to Supabase — it's local-only.

There is no hand-written server here. The frontend talks to Supabase's auto-generated REST API
through the `supabase-js` client library (loaded as a plain ES module, no build step). Every
table read/write is authorized by Postgres Row Level Security (RLS) using the caller's Supabase
Anonymous Auth session (`auth.uid()`) — see `research.md` #4 and `data-model.md`. This document
describes the *shape* of those calls, not literal HTTP routes to implement by hand.

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

## Error shape

`supabase-js` calls return `{ data, error }`. On failure, `error.message` is a Postgres/PostgREST
message — the frontend rephrases it into the app's non-judgmental tone (per constitution
Principle I) rather than surfacing raw database errors to the user; it never blocks on a
technical error type the UI doesn't recognize (falls back to a generic, gentle "that didn't quite
go through — want to try again?" message).
