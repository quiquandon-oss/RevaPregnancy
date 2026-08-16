# API Contract: Crave & Care Sync Backend

Scope reminder: this API exists **only** for the two entities that must sync across two
people's devices (`CravingDispatch`, `SupportNetworkMember`). Everything else in the app
(comfort entries, appointments, questions, profile) never touches this API — it's local-only.

All requests are plain JSON over HTTPS to the Cloudflare Worker. There is no session/cookie
auth; every request identifies its caller with a device token header (see research.md #4):

```
X-Device-Token: <opaque string, generated client-side on first use or on invite acceptance>
```

The server never trusts a device token to *be* a particular permission — it looks up what that
token is allowed to see/do on every request (e.g. "is this the owner?" / "is this an accepted,
non-revoked assigned member?").

## Dispatches

### `POST /api/dispatches`
Create a craving dispatch. Caller must be the owning user's device token.

Request body:
```json
{
  "category": "salty",
  "itemName": "pickled mango",
  "intensity": 4,
  "fulfiller": "support_member",
  "assignedMemberId": "sm_123"
}
```
`assignedMemberId` omitted/null when `fulfiller` is `"self"`.

Response `201`:
```json
{
  "id": "cd_456",
  "status": "requested",
  "requestedAt": "2026-08-16T14:02:00Z"
}
```
When `fulfiller` is `"self"`, the response's `status` is `"delivered"` immediately (see
data-model.md).

Errors: `400` invalid category/intensity; `403` `assignedMemberId` does not belong to this owner
or is not in `accepted` status.

### `GET /api/dispatches?role=owner|assignee`
List dispatches relevant to the caller. `role=owner` (default) returns dispatches the caller's
device token created. `role=assignee` returns dispatches assigned to the caller as a
support-network member — this is what the partner view (`partner.html`) polls.

Response `200`: array of dispatch objects (full shape as in data-model.md, camelCase).

### `GET /api/dispatches/:id`
Fetch one dispatch. Caller must be its owner or assigned member.

### `PATCH /api/dispatches/:id/status`
Advance or cancel a dispatch's status.

Request body:
```json
{ "status": "on_the_way" }
```

Authorization: the owner may set `status: "cancelled"` only from `requested`/`accepted`. The
assigned member may set `status` forward one step at a time along
`accepted → on_the_way → delivered` (and `accepted` itself, from `requested`). Any other
transition, or a caller who is neither owner nor assignee, gets `403`.

Response `200`: the updated dispatch object.

## Support Network

### `POST /api/support-network/invites`
Create an invite. Caller becomes the invite's owner.

Request body:
```json
{ "permissionLevel": "dispatch_recipient" }
```

Response `201`:
```json
{ "id": "sm_123", "inviteCode": "warm-otter-42", "status": "pending" }
```
The frontend turns `inviteCode` into a shareable link (e.g. `/partner.html?invite=warm-otter-42`)
via a client-only concern — the delivery channel itself (SMS/email) is simulated per FR-023 and
out of scope for this API.

### `POST /api/support-network/invites/:inviteCode/accept`
Accept an invite. No prior authentication — this is how a support-network member gets a device
token in the first place.

Request body:
```json
{ "displayName": "Sam" }
```
`displayName` optional per FR-020.

Response `200`:
```json
{ "id": "sm_123", "status": "accepted", "memberDeviceToken": "..." }
```
The frontend stores `memberDeviceToken` locally and uses it as this device's `X-Device-Token`
from then on.

Errors: `404` unknown/expired code; `409` invite already `revoked`.

### `GET /api/support-network`
List the caller's own support-network members (caller must be the owning user).

Response `200`: array of `SupportNetworkMember` objects (camelCase, per data-model.md), including
`pending` invites not yet accepted.

### `PATCH /api/support-network/:id`
Owner-only. Revoke access or change permission level.

Request body:
```json
{ "status": "revoked" }
```
or
```json
{ "permissionLevel": "full_support_access" }
```

Response `200`: updated member object. A `revoked` status takes effect immediately — any
subsequent request bearing that member's device token gets `403` on every dispatch/support-network
route (FR-021).

## Error shape (all endpoints)

```json
{ "error": { "code": "forbidden", "message": "human-readable, non-technical explanation" } }
```
Per constitution Principle I, `message` text follows the same non-judgmental tone rules as the
rest of the app even though this is a machine-facing API — errors surfaced to the user in the UI
are drawn from (or rephrased gently from) this field.
