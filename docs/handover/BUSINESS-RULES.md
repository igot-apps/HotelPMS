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
  (extend/shorten), correct payment, checkout with balance owing.
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
  when expired.
- Platform admin can grant **free access** (1–365 days, reason required, audited). If the hotel
  still has paid time, free days start after it. Billing page shows "Free access until …".
