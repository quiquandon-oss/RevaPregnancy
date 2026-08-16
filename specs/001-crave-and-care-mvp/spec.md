# Feature Specification: Crave & Care MVP

**Feature Branch**: `001-crave-and-care-mvp`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "Crave & Care is a calm, supportive Progressive Web App for pregnant
individuals covering: instant craving dispatch (self/partner/support-network fulfillment with
status tracking), physical & emotional comfort tracking (energy level + comfort statuses with
gentle suggestions), an appointment ledger (next-visit countdown, prep checklist, persistent
question capture), a partner/support-network invite system, and first-run onboarding/profile.
Must follow the Crave & Care constitution: non-judgmental tone, not a medical device, private
and revocable partner access, accessible, offline-capable for core logging, and built on the
'Modern Nurturing' design system."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Craving Dispatch (Priority: P1)

A pregnant user has a sudden craving. She opens the app, taps a craving category, optionally adds
a quick note, and sends it either to herself (just logging it) or to an invited partner/support
person to fulfill. She can see the current status of her most recent request at a glance.

**Why this priority**: This is the app's signature, most time-sensitive interaction and the
primary reason someone opens the app. It must work standalone as a complete, valuable experience
even before comfort tracking or appointments exist.

**Independent Test**: Can be fully tested by opening the app, selecting a craving category,
sending a dispatch to "Self," and confirming it is logged with a status — with no partner,
comfort tracking, or appointment features involved.

**Acceptance Scenarios**:

1. **Given** the user is on the Home screen, **When** she taps a craving category (e.g. "Salty"),
   **Then** a dispatch form opens with that category pre-selected.
2. **Given** the dispatch form is open, **When** she enters an item name, sets an intensity, chooses
   "Self" as the fulfiller, and confirms, **Then** the request is saved immediately (even with no
   network connection) and the Home screen's status banner reflects it.
3. **Given** the user has at least one invited, accepted support-network member, **When** she opens
   the dispatch form and chooses that person as the fulfiller instead of "Self," **Then** the
   request is sent to exactly that one person and its status starts as "Requested."
4. **Given** a dispatch was sent to a support-network member, **When** that person opens their
   view and accepts it, **Then** the status updates to "Accepted" and the original user sees the
   updated status without taking any action.
5. **Given** an accepted dispatch, **When** the support-network member marks it "On the way" and
   later "Delivered," **Then** the user's Home screen banner reflects each change in turn.
6. **Given** the user has fulfilled or received items before, **When** she opens a category's
   dispatch form, **Then** she sees her most recently used items for that category offered as
   quick suggestions.
7. **Given** the device has no network connection, **When** the user creates a dispatch, **Then**
   it is saved locally right away and automatically sent once the connection returns.

---

### User Story 2 - Comfort & Energy Check-in (Priority: P1)

A pregnant user wants to quickly note how she's feeling — her energy level and any physical or
emotional discomfort — without filling out a long form, and get a small, gentle suggestion in
return.

**Why this priority**: Tied with craving dispatch as a core, frequent, low-effort daily habit the
product is built around; independently valuable even if no one else ever sees this data.

**Independent Test**: Can be fully tested by opening the Comfort tab, setting today's energy
level, selecting a comfort status from the curated list, reading its suggestion, and marking it
addressed — with no dependency on dispatch or appointment features.

**Acceptance Scenarios**:

1. **Given** the user opens the Comfort tab on a given day, **When** she has not yet set an energy
   level for today, **Then** she can choose one of Low / Moderate / Full using a simple control.
2. **Given** an energy level is already set for today, **When** she reopens the Comfort tab later
   the same day, **Then** her existing selection is shown and can be changed.
3. **Given** the user is on the Comfort tab, **When** she selects a comfort status from the
   curated list (e.g. "Needs Lower Back Relief"), **Then** it expands to show 1-3 short, gentle,
   non-medical suggestions and a way to mark it "addressed."
4. **Given** none of the curated statuses fit, **When** the user adds a custom status with her own
   label, **Then** it is saved and can also be marked addressed later.
5. **Given** the device is offline, **When** the user logs an energy level or comfort status,
   **Then** it is saved locally immediately and syncs automatically once online.

---

### User Story 3 - Appointment Prep (Priority: P2)

A pregnant user wants to keep track of her upcoming prenatal appointments, see how many days
remain until the next one, prepare using a checklist, and jot down questions she wants to
remember to ask her provider.

**Why this priority**: High value but less time-sensitive than daily craving/comfort logging;
naturally builds on having a user profile already in place, so it follows the P1 stories.

**Independent Test**: Can be fully tested by creating an appointment with a date, adding a couple
of checklist items and a question, and confirming the countdown, checklist, and question all
persist and display correctly — independent of dispatch or comfort features.

**Acceptance Scenarios**:

1. **Given** the user has no appointments yet, **When** she creates one with a title, type, and
   date/time, **Then** it becomes her "Next Visit" if it is the soonest upcoming appointment.
2. **Given** an upcoming appointment exists, **When** the user views the Appointment Ledger,
   **Then** she sees a countdown in days along with the appointment's details.
3. **Given** an appointment is open, **When** the user adds a checklist item, **Then** it appears
   in that appointment's own checklist and can be checked off or removed; each appointment starts
   with an empty checklist that the user builds herself.
4. **Given** the user thinks of something to ask her provider, **When** she captures it as a
   question at any time (not just while viewing a specific appointment), **Then** it is saved to a
   running list that persists across appointments until she marks it "asked."
5. **Given** an appointment is within a few days, **When** the user views the Appointment Ledger,
   **Then** she sees a "ready for your visit" summary listing her unchecked prep items and
   unasked questions together.

---

### User Story 4 - Support Network Invite (Priority: P2)

A pregnant user wants to bring a partner or trusted person into the app so that person can receive
and fulfill craving dispatches, without that person needing to create an account.

**Why this priority**: Unlocks the partner-fulfillment half of User Story 1's value, but the app
must be fully usable solo first (self-dispatch, comfort, appointments), so this follows the P1
stories.

**Independent Test**: Can be fully tested by generating an invite link/code, having it "accepted"
(simulated for MVP), confirming the invited person appears in the Support Network list with a
permission level, and confirming the inviting user can revoke that access at any time.

**Acceptance Scenarios**:

1. **Given** the user is on the Support Network screen, **When** she creates an invite, **Then**
   a shareable link/code is generated (actual SMS/email delivery is simulated for MVP) with no
   requirement for the invited person to register an account or set a password.
2. **Given** an invite link/code exists, **When** the invited person opens it, **Then** they can
   optionally enter just a display name and immediately gain access scoped to that invite's
   permission level — no separate signup step.
3. **Given** an invite has been accepted, **When** the inviting user views her Support Network
   list, **Then** she sees that person, their permission level, and options to change or revoke
   access.
4. **Given** an invited person has active access, **When** the inviting user revokes it, **Then**
   that person immediately loses the ability to view or act on dispatches, with no further action
   needed by either party.
5. **Given** an invited person has "can receive dispatches" permission, **When** they open their
   own simplified view, **Then** they see only open dispatches assigned to them (not the full
   Crave & Care app).
6. **Given** an invited person has "full support access" permission, **When** they open their own
   simplified view, **Then** they see dispatches assigned to them plus the owner's mood/energy
   check-ins and Timeline (photos, ultrasounds, milestones), but still not the full app (no
   appointments, questions, or profile access).

---

### User Story 5 - Onboarding & Profile (Priority: P3)

A first-time user is welcomed into the app, enters her name and due date (or current pregnancy
week), optionally invites a partner right away, previews the app's calm design and tone, and
acknowledges that the app is not a medical device before she starts using it.

**Why this priority**: Necessary for a polished first-run experience and to satisfy the
constitution's disclaimer requirement, but the other stories can be developed and tested using a
minimal/stubbed profile in the meantime.

**Independent Test**: Can be fully tested by completing the onboarding flow end-to-end on a fresh
install and confirming a profile is created, the disclaimer is acknowledged and recorded, and the
user lands on the Home screen.

**Acceptance Scenarios**:

1. **Given** a first-time visitor opens the app, **When** onboarding begins, **Then** she is
   shown a welcome step, a name + due date (or current week) step, an optional partner-invite
   step she can skip, and a brief preview of the app's look and tone.
2. **Given** onboarding is in progress, **When** she reaches the medical-disclaimer step,
   **Then** she must acknowledge it before continuing, and the acknowledgment is stored so it is
   not shown again as a blocking step.
3. **Given** onboarding is complete, **When** the user opens Profile later, **Then** she can view
   and edit her name, due date/week, and notification preferences, and reach Support Network
   management from there.
4. **Given** the user wants to make sure she doesn't lose her data or wants to use the app from a
   second device, **When** she chooses to back up her account from Profile and adds her email,
   **Then** she can later open the app on a different device, confirm via a link sent to that
   email, and see her existing cravings, comfort history, appointments, and support network
   exactly as she left them — without ever needing to set or remember a password.

---

### Edge Cases

- What happens when a user sends a dispatch to a support-network member who never responds? The
  request remains in "Requested" status; the user can cancel it manually at any time (no
  automatic expiry in the MVP).
- What happens if a user has no support-network members yet and taps a craving category? She can
  still complete the dispatch by choosing "Self" as the fulfiller; sending to another person is
  simply not offered until someone has been invited and accepted.
- What happens if the invited person's link/code is used more than once or shared further? Each
  use creates or resumes that same invited-person's access under the permission level the inviter
  set; the inviting user can see and revoke it like any other support-network member.
- How does the system handle two locally-queued offline actions that conflict (e.g. the same
  dispatch cancelled on one device and updated on another before syncing)? The most recent
  timestamped action wins once synced, and the user is shown the resulting state (not an error).
- What happens when a user tries to set a due date in the past or an appointment date that has
  already passed? The system accepts it without blocking (users may be logging historical data)
  but a past appointment no longer counts as the "Next Visit."
- What happens when a user removes her last comfort status or craving item for the day? The
  screen returns to its empty/prompting state rather than showing an error.

## Requirements *(mandatory)*

### Functional Requirements

**Craving Dispatch**

- **FR-001**: The system MUST let a user create a craving dispatch by selecting a category (at
  minimum: Salty, Sweet, Sour, Cold Drink, Fresh Fruit, and a free-text "Specific Snack" option),
  an optional item name/note, and an intensity level.
- **FR-002**: The system MUST let a user choose exactly one fulfiller per dispatch: herself, or one
  specific accepted support-network member.
- **FR-003**: The system MUST track each dispatch through the status sequence Requested →
  Accepted → On the way → Delivered, plus a Cancelled state reachable from Requested or Accepted.
- **FR-004**: The system MUST let the user cancel a dispatch she created while it is in Requested
  or Accepted status.
- **FR-005**: The system MUST let an assigned support-network member view dispatches sent to her
  and advance their status (Accept, mark On the way, mark Delivered).
- **FR-006**: The system MUST display the status of the user's most recent dispatch on the Home
  screen and update it as the status changes.
- **FR-007**: The system MUST suggest the user's most recently used items (up to 10) for a given
  category when she opens that category's dispatch form.
- **FR-008**: The system MUST let the user optionally enable a "pregnancy-safe notes" setting
  that, when on, shows a short, non-blocking safety note for relevant items; this setting MUST be
  off by default and MUST NEVER prevent a dispatch from being created or fulfilled.
- **FR-009**: The system MUST allow dispatch creation, and updates to a dispatch's own status by
  its creator or assigned fulfiller, to work fully offline, queuing changes locally and syncing
  automatically once connectivity returns.

**Comfort Tracking**

- **FR-010**: The system MUST let the user set one energy level (Low, Moderate, or Full) per
  calendar day, and change it later the same day.
- **FR-011**: The system MUST offer a curated list of common comfort statuses (e.g. "Needs Lower
  Back Relief," "Resting / Quiet Time," "Needs Fresh Air," "Nausea Present," "Swelling Noticed")
  that the user can select, plus the ability to add a custom status with her own label.
- **FR-012**: The system MUST show 1-3 short, non-medical suggestions when a curated comfort
  status is selected, and MUST let the user mark any selected status as "addressed."
- **FR-013**: The system MUST allow energy and comfort logging to work fully offline, queuing
  locally and syncing automatically once connectivity returns. Once synced, this data MUST be
  durable beyond the local device (i.e. not lost if the device is lost, reset, or has its
  browser data cleared).

**Appointment Ledger**

- **FR-014**: The system MUST let the user create an appointment with a title, type, date/time,
  and optional location.
- **FR-015**: The system MUST identify and prominently display the soonest upcoming appointment
  as the "Next Visit," including a countdown in days.
- **FR-016**: The system MUST let the user add, check off, and remove checklist items on a given
  appointment; each appointment's checklist MUST start empty and be built by the user.
- **FR-017**: The system MUST let the user capture a free-text question at any time, independent
  of any specific appointment, and MUST keep it visible in a running list until she marks it
  "asked."
- **FR-018**: The system MUST show a combined "ready for your visit" summary of an appointment's
  unchecked checklist items and unasked questions when that appointment is upcoming.

**Support Network**

- **FR-019**: The system MUST let the user generate a shareable invite (link or code) for a
  partner or support-network member, choosing a permission level for that invite ("can receive
  craving dispatches" at minimum, with room for broader access levels).
- **FR-020**: The system MUST let a person who opens a valid invite gain access scoped to that
  invite's permission level without creating a full account (password, etc.); an optional display
  name is the only input required.
- **FR-021**: The system MUST let the inviting user view all her support-network members with
  their current permission level, and revoke any member's access at any time, taking effect
  immediately.
- **FR-022**: The system MUST show an invited support-network member a simplified view limited
  to her permission level: `dispatch_recipient` sees only the dispatches assigned to her;
  `full_support_access` additionally sees the owner's mood/energy check-ins and Timeline
  (photos, ultrasounds, milestones). Neither level shows the full app experience (appointments,
  questions, profile, etc. remain owner-only).
- **FR-023**: The system MUST simulate/stub the actual delivery of invite links (e.g. via SMS or
  email) for the MVP rather than integrating a live delivery vendor.

**Onboarding & Profile**

- **FR-024**: The system MUST walk a first-time user through onboarding steps covering: welcome,
  name and due date (or current pregnancy week), an optional/skippable partner invite, a brief
  preview of the app's design and tone, and acknowledgment of the medical disclaimer.
- **FR-025**: The system MUST require the medical disclaimer to be acknowledged once before the
  user can use the rest of the app, and MUST NOT show it again as a blocking step afterward.
- **FR-026**: The system MUST let the user view and edit her name, due date/current week, and
  notification preferences from a Profile screen, and reach Support Network management from
  there.
- **FR-027**: The system MUST keep the medical disclaimer reachable at any later time (e.g. from
  Profile) even though it is not shown as a blocking step again.
- **FR-031**: The system MUST let the user optionally link an email address to her profile, with
  no password to set or remember, so she can resume the same profile and data on a different
  device by confirming a link sent to that email. This MUST remain entirely optional and MUST
  NOT be required to use any other part of the app.

**Cross-Cutting**

- **FR-028**: All user-facing text (including error, empty, and confirmation states) MUST follow
  the constitution's non-judgmental tone rules (no "should/must/avoid" phrasing, no clinical or
  alarmist language).
- **FR-029**: All interactive elements MUST meet the constitution's accessibility requirements
  (WCAG 2.1 AA contrast, minimum 48px touch targets), the app MUST offer reduced-motion and
  high-contrast display modes, and MUST support voice input for custom craving entries and
  free-text questions.
- **FR-030**: The system MUST NOT sell or share a user's craving, comfort, or appointment data
  with third parties, and MUST encrypt this data at rest.

### Key Entities *(include if feature involves data)*

- **User**: The pregnant individual using the app. Holds name, due date or current pregnancy
  week, notification preferences, her medical-disclaimer acknowledgment status, and an optional
  linked email (with a linked/not-linked status) used only to resume her profile on another
  device.
- **SupportNetworkMember**: A partner or trusted person invited by a User. Holds a display name,
  the permission level granted, an accepted/pending/revoked status, and a reference to the
  invite used. Does not require a full account/password.
- **CravingDispatch**: A single craving request. Holds the category, item name/note, intensity,
  chosen fulfiller (the User herself or one SupportNetworkMember), current status
  (Requested/Accepted/On the way/Delivered/Cancelled), and timestamps for each status change.
- **DailyComfortEntry**: One day's comfort record for a User. Holds the date, the day's energy
  level, and a list of comfort statuses logged that day (each with its label, whether it's a
  curated or custom status, and whether it has been marked addressed).
- **Appointment**: A scheduled prenatal visit. Holds title, type, date/time, optional location,
  and its own checklist of user-created items (each with a label and checked/unchecked state).
- **Question**: A free-text question the User wants to ask her provider. Holds the question text,
  an asked/unasked status, and is not tied to a single Appointment (it persists across visits
  until marked asked).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the app to a craving dispatch being saved in under 8
  seconds of active interaction time.
- **SC-002**: An invited support-network member can view and accept a dispatch sent to her within
  a single, simplified view, with no account-creation step in the way.
- **SC-003**: A user can log an energy level and at least one comfort status, and mark it
  addressed, in three or fewer taps/interactions after opening the Comfort tab.
- **SC-004**: A user can create an appointment, add at least one checklist item, and add at least
  one question to ask, all within the Appointment Ledger, without leaving that section of the app.
- **SC-005**: All core logging actions (creating a craving dispatch, logging energy/comfort)
  succeed and are visibly saved even when the device has no network connection at the time.
- **SC-006**: In a review of all user-facing screens, zero instances of clinical, alarmist, or
  directive ("should/must/avoid") language are found in copy, and zero text/icon combinations fail
  WCAG 2.1 AA contrast.
- **SC-007**: A user can fully revoke a support-network member's access, and that member loses
  visibility into dispatches immediately (verified on the member's own view), with no additional
  steps required.
- **SC-008**: A user who has linked an email can open the app on a new/second device, confirm via
  the link sent to that email, and see her existing cravings, comfort history, appointments, and
  support network — with no password ever set or required.

## Assumptions

- Support-network members access the app via an unauthenticated (or lightly-named) invite
  link/code rather than a full account, per product decision; this trades some identity
  verification for lower friction, consistent with the constitution's low-friction principle.
- A craving dispatch is sent to exactly one fulfiller at a time (self or one specific
  support-network member); broadcasting to multiple people at once is out of scope for the MVP.
- Appointment checklists start empty and are fully user-built for the MVP; ready-made checklist
  templates per appointment type are a possible future enhancement, not required now.
- "Simulated/stubbed" invite delivery means the MVP does not need to integrate a live SMS/email
  vendor; the invite link/code itself is real and functional, only its delivery channel is
  mocked.
- Users have a single active pregnancy profile at a time; multi-pregnancy history tracking is out
  of scope for the MVP.
- Craving/energy correlation insights, native mobile wrappers, monetization, and full
  multi-language support are explicitly out of scope for this MVP feature (see product blueprint
  §5.4, §6.1, §11); data structures should not actively block adding them later, but no UI or
  logic for them is required now.
- The primary User's own identity starts as a frictionless, no-signup profile (matching the
  support-network member experience), and email-linking (FR-031) is a purely optional upgrade she
  can trigger from Profile whenever she wants cross-device access — never a required step.
- Craving dispatches and support-network data were already server-backed (for cross-person
  visibility); comfort/energy data is also server-backed per product-owner decision so that it
  survives device loss and is reachable once a user links her email, consistent with FR-013's
  durability requirement.
