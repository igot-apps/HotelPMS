# Business rules (how the app behaves today)

Change these only when the owner asks. Code locations are given so you can verify.

## Roles and permissions
- **Manager**: everything in their hotel; approves requests; sets receptionist limits.
- **Receptionist**: front desk. Per-user extras set by a manager on Users → receptionist →
  Approval: correction permissions, financial limits (`financialDelegation`), and
  "Hide rooms from online booking" (`canManageOnlineRooms`).
- **Housekeeper**: housekeeping screens only.
- **Platform Admin**: all hotels, subscriptions, free access, domains (`/superadmin`).

## Online booking (public site)
- Guest must sign in (email). Clicking pay creates a **Pending** reservation that holds one
  specific room for **10 minutes** (`ONLINE_HOLD_MINUTES`, `reservation/online-hold.service.ts`),
  then opens Paystack. Payment verify/webhook confirms the booking.
- Late payment after the hold expired → booking Expired, payment flagged for refund review.
- Only rooms with `operationalStatus = Available` **and** `isOnlineBookable = true` are offered
  (`availableRoomsForStay` in `public/public.routes.ts`, and online path of
  `reservation/booking-creation.service.ts`). Hiding a room never cancels a hold in progress.
- Hotel-wide switches: `isOnlineBookingEnabled`; online booking also pauses when the hotel's
  subscription has expired.

## Payments and SMS
- Desk payments are recorded by staff. Online payments go through Paystack with the hotel's key.
- After an online payment fully pays a Website booking, a "Payment of GHS X received… booking
  confirmed" SMS is sent (`notifications/simulated-sms.service.ts`), **only if** the hotel's
  **Guest SMS** switch is on (`Property.smsSimulationEnabled`, Notifications page). It sends live
  through Moolre when `MOOLRE_SMS_VAS_KEY` is set, otherwise it's only simulated/logged.
  Recipient = phone saved on the booking. Cancelling a confirmed booking also sends an SMS.
- SMS status "Accepted" = Moolre accepted it; delivery is checked separately (Check status).

## Refunds (`reservation/refund.service.ts`, `backend/REFUNDS.md`)
- Receptionist **requests** a refund → manager approves → staff record money returned.
- Manager can **record a refund directly** in one step (details + how money was returned).
- MoMo refunds can run in simulation mode (no real money).

## Corrections and approvals (`reservation/recovery.service.ts`, `correction-approval.service.ts`)
- Actions: undo check-in/checkout, restore cancelled, transfer room, correct departure date
  (extend/shorten), correct payment, checkout with balance owing, record actual departure.
- Every correction is previewed, then confirmed with a version check; if the booking changed
  in between, preview again. All corrections are audited.
- Receptionist outside their limit → creates a **request**; the booking is unchanged until a
  manager approves. One pending request per receptionist per booking.
- **Extend** at the agreed rate: managers and receptionists apply directly (Extend button or
  Corrections panel). **Shorten**: receptionist needs a `correct-date` limit covering the
  reduction, else manager approval. Shortening that creates overpayment marks refund pending;
  money is returned only through the refund process.
- **Early checkout** (Check Out Room before the departure date) shows a choice: keep original
  charges (default) or shorten stay and recalculate (uses the rules above).
- **Checkout with balance owing** is blocked unless a manager approves with a reason (or a
  receptionist within their `credit-checkout` limit). Credit owed to the guest does not block.

## Stays, checkout and consumed nights
Code: `reservation/stay-timing.ts`, `reservation/checkout-alerts.service.ts`,
`recovery.service.ts` (`record-departure`, `transitionStay`), tests in `tests/stay-management.test.ts`.
- **Nights are calendar nights** (stay dates are date-only). Monday 23:00 in → Tuesday 02:00 out
  = 1 night. Crossing midnight never adds a night. Actual check-in/out timestamps are kept
  separately and only used for display, lateness and evidence.
- **Expected checkout** = departure date at the hotel's `checkOutTime` in the hotel's `timezone`.
- **Late departure**: checking out after checkout time shows how late and accepts an optional
  note; `lateMinutes` and the note go into the checkout audit. **No fee and no extra night.**
- **Checkout reminders** (Dashboard panel + red sidebar badge): states `due` (within a day),
  `dueSoon` (within an hour), `overdue`. Escalated to managers after 3 h overdue or when a guest
  is marked "cannot be found". Alerts persist until checkout or extension. No SMS.
- **Verify** (from a reminder): still here / has left / cannot be found (note required).
  Recorded as audit action `DepartureVerified`; "has left" also sets guest presence to Out.
- **Forgotten checkout = correction action `record-departure`** ("Record departure" on a
  checked-in room, or Verify → has left → left earlier). Manager applies; receptionist requests
  approval. Requires departure time, evidence type and explanation. The stay ends on the
  departure day (but at least one night, never later than the booked departure), so consumed
  nights stay charged and nothing is ever added; overpayment → pending refund (existing flow).
  Only records that put the guest in the room *after* the claimed time (marked Returned, a
  "still here" verification) are contradictions and need an extra explanation; housekeeping or
  payments afterwards are information only.
- **Overdue checked-in guests block the room** in staff search/booking for stays starting today
  or earlier (`overdueOccupancyClause`); future dates and online booking are unaffected.

## Rooms
- **Maintenance needs a reason** (preset list or custom, 3–200 chars), stored as
  `maintenanceReason`, cleared when the room returns to Available. Occupied rooms can't go to
  maintenance.
- **Check-in to a room that isn't Clean/Inspected** is allowed only with confirmation: the
  dialog shows "Room X needs cleaning" + checkbox "Check the guest in anyway"; the server
  requires `uncleanRoomConfirmed` (error code `ROOM_NOT_CLEAN`). Bulk booking-level check-in
  does not ask. Room **transfers** still require a clean room.
- Housekeeping status `Dirty` is shown to staff as **"Needs cleaning"**.

## Guests
- One `PlatformGuest` per person (name, phone, email shared across hotels).
- Passwords are per hotel (`HotelGuestAccount`) or central (`centralPasswordHash`).
- Guest **My profile** (`/public/profile`): edit name and phone; "Set password" reveals
  current/new/confirm fields. Changing the password signs out other devices for that account.

## Subscriptions (hotels pay HideOut24)
- Trial → paid via Paystack (platform key). Expiry notices on the dashboard; online booking pauses
  when expired. Expired **and Cancelled** hotels are read-only (writes blocked) but can still renew.
- Packages (all with the same features): Standard GHS 200 / 10 rooms / 2 staff, Pro GHS 350 / 20 / 4,
  Custom GHS 50 + 5/room + 10/staff. 1–24 months; discounts 3+ 8.33%, 6+ 10%, 12+ 16.67%, 24 20%.
  All of this is **runtime config** (`subscription_settings`, edited in Super admin → Plans & pricing);
  pricing logic lives only in `backend/src/modules/payment/subscription-plans.ts`.
- Usage = rooms in active room types (not deactivated) and staff that are active or have a pending
  invitation (managers included). Limits block creating/reactivating rooms or staff only; existing
  operations never stop when a hotel is over its allowance.
- Upgrades apply immediately after paying the prorated price difference for the remaining period.
  Downgrades are paid at renewal and take effect when the current period ends; they are refused
  until usage fits. Paid orders store their own price/allowances, so later price edits never change them.
- Platform admin can set per-hotel overrides (extra % discount, room/staff allowance) and see payment
  and plan-change history (audit log actions `SubscriptionPurchased`, `SubscriptionOverrideChanged`).
- Platform admin can grant **free access** (1–365 days, reason required, audited). If the hotel
  still has paid time, free days start after it. Billing page shows "Free access until …".

## Multi-property owners

- `User.propertyId` is the account's **home** property. `property_memberships` lists every property an account can work in; the registering owner has `isOwner = true`.
- The **active** property is the `propertyId` in the JWT. Owners switch with `POST /api/auth/switch-property` (fresh tokens; the frontend clears caches and reloads). Services keep scoping by `req.user.propertyId`; actor lookups use `atProperty()` from `shared/utils/property-access.ts`.
- Only an owner can add a property (`POST /api/auth/properties`). Added properties get **no free trial** (read-only until subscribed), and an owner cannot add another while one of their properties has expired without ever being paid. Max 20 per account.
- Subscriptions, plans, renewals, room/staff limits and expiry stay per property. The owner never uses a staff seat (`countsAsStaff()`); other managers do.
- Ordinary staff stay single-property. Deactivating a membership ends sessions for that property only; deactivating the account ends all.
- `audit_logs.propertyId` records where an action happened (older rows fall back to the user's home property, see `auditAt()`).
- Permanently deleting an owner's home property moves their home to another property they own instead of deleting the account.
