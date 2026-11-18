# HideOut24 — How the staff app works today (investigation for usability review)

Scope: the internal staff app (managers and receptionists). Facts only, taken from the source code, no recommendations.
State described: the current working copy on 18 Nov 2026, including the latest changes that are not yet committed:
- receptionists record refunds and check out guests who owe money without a manager;
- the non-refundable policy;
- action buttons in the dashboard pop-ups.

---

## 0. Key concepts (needed to read the rest)

- **Booking vs room stay.** A *reservation* (booking) has one code, one guest, one total and one balance. It contains one or more *room stays* (`reservationRooms`). Each room stay has its own room, dates, nightly price, occupant name/phone and status.
- **Booking status** (`Reservation.status`): `Pending` (online hold awaiting payment), `Confirmed`, `InHouse`, `Completed`, `Cancelled`, `Expired`, `NoShow`.
  - Derived automatically from the rooms: `InHouse` as soon as any room is checked in; `Completed` when every active room is checked out.
- **Room stay status**: `Reserved`, `CheckedIn`, `CheckedOut`, `Cancelled`.
- **Money is booking-level.** Total, amount paid, balance, payments and refunds belong to the booking, never to a single room. There is no per-room payment allocation.
- **Nights** are calendar nights. Checking out late never adds a night or a fee; lateness is only recorded.
- **Booking code** = `confirmationCode`, format `RES-XXXXXXXX-XXX` (e.g. `RES-7239B6C9-713`).

---

## 1. Navigation structure

Left sidebar ([Sidebar.jsx](../../frontend/src/components/layout/Sidebar.jsx)). The top bar shows the hotel name and the user; on phones it also has a shortcut: **Refunds** for receptionists, **Approvals** for managers ([Topbar.jsx](../../frontend/src/components/layout/Topbar.jsx)).

| Menu item | Receptionist | Manager | Notes |
|---|---|---|---|
| Dashboard | ✓ | ✓ | Managers get a Front desk / Manager switch |
| Check Availability | ✓ | ✓ | Free rooms by date |
| Reservations | ✓ (needs `CanCreateReservation`) | ✓ | Main working page |
| Approvals | – | ✓ | Manager only |
| Refunds | ✓ | ✓ | Refund queue |
| Rooms & Inventory | ✓ | ✓ | Room status, cleaning toggle, maintenance, guest out/in |
| Housekeeping | only if housekeeping is enabled for the hotel and the user has `CanManageHousekeeping` | same | Housekeeper role sees only this |
| Guests | ✓ | ✓ | |
| Reports | – | ✓ (`CanViewFinancialReports`) | |
| Room Management | – | ✓ (`CanCreateRoom`) | Room types, rooms, prices |
| Staff Management | – | if `CanManageStaffAndRoles` | |
| Properties | ✓ (no permission check) | ✓ | Hotel settings form |
| Billing & Plan | – | if `CanManageBilling` | |

- **Not in the menu:** a `/calendar` page exists as a route ([App.jsx](../../frontend/src/App.jsx)) but has no menu entry.
- **Removed from the menu:** the Guest messages page (`/notifications`).

**Receptionist permissions given to invited staff** ([invitation.service.ts](../../backend/src/modules/user/invitation.service.ts)):
- `CanCreateReservation`, `CanCancelReservation`
- `CanCheckInGuest`, `CanCheckOutGuest`
- `CanViewRooms`, `CanUpdateRoomStatus`
- `CanProcessPayments`

The older seed file gives receptionists fewer permissions: no cancel, no room status, no payments.

---

## 2. Receptionist dashboard (`/dashboard`, "Front desk" view)

Source: [DashboardPage.jsx](../../frontend/src/pages/DashboardPage.jsx), [TodayAtAGlance.jsx](../../frontend/src/components/dashboard/TodayAtAGlance.jsx).

Top to bottom:

1. **Greeting:** hotel name, "Good evening, <first name>", the date in the hotel's time zone.
2. **Subscription notice.** Receptionists see it only when the subscription has expired.
3. **"Today at a glance"**, refreshed every minute.
   - **Banners** when online booking is blocked (hotel deactivated, subscription expired, online booking off, no rooms, all rooms in maintenance, all rooms hidden) or when the hotel is "Fully booked tonight" (with "See other dates").
   - **Nine tiles.** Each opens a side panel (drawer) with the rows behind the number:

| Tile | Value / hint | Drawer contents | Buttons per row |
|---|---|---|---|
| Overdue checkouts | count; "Longest: X late" or the checkout time | in-house rooms past the checkout time, with how late, last verification result, balance | **Check out**, **Take payment** (if a balance is owed) |
| Arrivals to check in | rooms expected today or earlier; "N arrived today · N unpaid" | "Missed arrival" (past the no-show cut-off: check-in time + 6 h), "Expected to check in", "Arrived today" | Missed: **Check in**, **Mark no-show**. Expected: **Check in**, **Take payment** (if owed). Arrived: none |
| Departures to check out | in-house rooms due today or earlier; "N checked out today" | "Due to check out", "Checked out today" | Due: **Check out**, **Take payment**. Checked out: **Take payment** if the booking still owes |
| Guests in house | count; "N of M rooms taken tonight" | each checked-in room: night X of Y, time in room, balance | **Check out**, **Take payment** |
| Rooms free tonight | count; occupancy % | free rooms grouped by room type, with Ready / Needs cleaning badge | **New booking** (opens the empty new-booking form, room not pre-selected) |
| Collected today | GHS amount; number of payments | each payment: amount, method, time, guest, who received it | none |
| Owed by guests in house | GHS amount; bookings | in-house bookings with a balance (one row per booking) | **Take payment**; also a link to Refunds if refunds are waiting |
| Owed after checkout | GHS amount; guests | checked-out bookings with a balance: guest, code, rooms, date left, reason, approver | **Take payment**, **View payments** |
| Needs attention | count | approvals waiting (manager), rooms needing cleaning, rooms in maintenance | Cleaning rows: **Mark clean** (needs `CanUpdateRoomStatus`; works in place). Others: none |

4. **Refund summary** (receptionists only): "Check approved refunds" with **Open refunds**.
5. **Correction requests** (receptionist): the receptionist's own requests that are waiting for a manager.
6. **Quick Actions:**
   - New booking (walk-in or reservation)
   - See free rooms by date
   - Reservations & payments
   - Rooms & housekeeping
   - Daily overview & collections (managers only)
7. **Checkout reminders** ([CheckoutAlerts.jsx](../../frontend/src/components/reservations/CheckoutAlerts.jsx)): one card per room due or overdue today.
   - Each card has an Overdue, "Due within the hour" or "Due today" badge, the guest's name, the expected time, the balance, the last verification result and an escalated flag.
   - Buttons: **Check Out**, **Extend**, **Verify**. Verify records the guest as still in the room, has left, or could not be found. "Has left" offers "They left earlier — record actual departure", which a manager must approve.
   - A sidebar badge counts overdue checkouts.

**How dashboard buttons behave.** Except for **Mark clean** and **Mark no-show**, which act in place, every button leaves the dashboard. It goes to `/reservations?search=<code>&open=<id>&do=<checkin|checkout|pay|extend>&stay=<roomStayId>`. The Reservations page then searches for that booking, expands its row and opens the matching dialog. Tapping a row's text opens the booking on the Reservations page without an action. After finishing, the user is on the Reservations page, not back on the dashboard.

**What dashboard rows show:** "Room <number> · <guest name>" plus details. **The booking code is not shown** on arrival, departure, overdue, in-house, collected or owed-in-house rows; only "Owed after checkout" shows it. Rows are **one per room stay**, so a 3-room booking appears as 3 rows. Each row shows the **whole booking's balance**, so the same amount appears on all 3.

**Not on the dashboard:** pending online holds awaiting payment, upcoming arrivals for future dates, and cancellations.

---

## 3. Manager dashboard

Managers see a **Front desk / Manager** switch under the greeting. The choice is remembered per manager **on that device** (`localStorage`). The Front desk view is identical to section 2, plus an **Approvals** summary card in place of the receptionist's refund and correction cards.

**Manager view** ([ManagerDashboard.jsx](../../frontend/src/components/dashboard/ManagerDashboard.jsx)), built from existing reports:
- **Needs your attention:** links for approvals waiting, refunds to return, guests who left owing (with total) and rooms needing cleaning. Each opens the related page; none acts in place.
- **Money:**
  - collected today (after refunds);
  - collected this month, with % change against the previous period;
  - owed by guests still here;
  - owed by guests who left.
- **Rooms:**
  - rooms taken tonight (X of Y);
  - "How full" this month (occupancy %);
  - "Average price per night sold" (ADR);
  - "Earned per room per night" (RevPAR).
- **Charts:** money collected each day this month (bars), how guests paid (by method) and money by room type.
- **Money taken by each staff member today:** name, count and total.
- **Link:** "Open full reports".

Tiles in the Manager view are **not clickable**; only the attention links and the reports link navigate.

**Reports page** (`/reports`, managers):
- The "Daily overview" with a date picker. It shows:
  - payments received, refunds returned and net collections;
  - amount outstanding now;
  - totals by method;
  - activity counts (bookings created, check-ins, checkouts, cancellations);
  - money returned today;
  - collections by staff;
  - a payment-entries table filterable by staff, showing time, guest/booking, recorded by, method and amount;
  - a collapsible "Activity and correction history" (audit events with actor and reason).
- Below that, "Analytics & Reports" with a date range: net collections with growth, transactions, occupancy, ADR, RevPAR, daily revenue bars, by method and by room type.

**Monitoring staff:** collections by staff (Reports daily overview and the Manager view), the payment-entries staff filter, the activity/correction history, and the reason and approver on "Owed after checkout". There is no separate staff-activity page.

**Approvals page** (`/approvals`, managers): an inbox of correction requests (Pending / To return / History) with approve and reject. With the current rules, only these still need a manager:
- recorded (backdated) departures;
- corrections to online (Paystack) payments;
- refund requests created before refunds became direct.

Receptionists can do everything else directly.

---

## 4. Reservation workflows (both roles unless noted)

### Reservations page (`/reservations`) — [ReservationsPage.jsx](../../frontend/src/pages/ReservationsPage.jsx)
- **Header:** "Total matching: N" and a big **New Booking** button.
- **Search box:** "Search guest, phone, room, or reference".
  - It matches guest name, phone, the room number of the room currently assigned, the booking code and the internal ID ([reservation.repository.ts](../../backend/src/modules/reservation/reservation.repository.ts)).
  - **Filters** panel: status, check-in from, check-out to. Results are paginated.
- **Desktop table columns:** ID / Booking contact (code, guest, phone), Room(s) (comma list), Dates, Status (raw value, e.g. `InHouse`, `NoShow`), Payment (total, "Due: X" or "Paid", refund badges), Actions.
- **Row actions** for Confirmed / InHouse bookings:
  - **Check in**, which becomes "Check in N rooms" when several rooms are due today;
  - **Check out**, which becomes "Check out N rooms" when several are in the room;
  - **Take payment** when a balance is owed. It also shows on Completed bookings that still owe.
  - **View assigned room(s)** expand / collapse;
  - **No Show** (Confirmed, after check-in time + 6 h);
  - **Cancel** (Pending/Confirmed with nobody checked in).
  - Cancelled bookings with a refund due show **Manage refund**; completed refunds show **Refund history**.
  - An eye icon opens the booking details page.
- **Phone cards:** the same data. Cancel and No-show are always visible as buttons.
- **Expanded "Assigned rooms · <code>" panel:** one card per room stay ([RoomCard.jsx](../../frontend/src/components/reservations/RoomCard.jsx)). Each card shows:
  - the room number and type;
  - its status (`Reserved`, `CheckedIn`, `CheckedOut`);
  - check-in time and time in room;
  - the occupant name/phone, with **Add occupant** or edit;
  - the nightly price;
  - a "Stay Extended" or "Departure Changed" note;
  - buttons: **Check In Room**, **Check Out Room**, **Extend**, **Shorten**;
  - a link, "Open reservation / correct or undo actions".

### Booking details page (`/reservations/:id`) — [ReservationDetailsPage.jsx](../../frontend/src/pages/ReservationDetailsPage.jsx)
- **Header:** "Reservation <code>", dates, status badge, a **Print** menu (A4 receipt / 80 mm thermal receipt) and **Back**.
- **Collapsible sections**, closed on every new visit:
  - **Reservation overview:** guest; rooms listed **read-only** with room number, type, occupant and price, but **no room status and no check-in/out buttons**.
  - **Correct or undo actions:** a dropdown of corrections:
    - undo mistaken checkout / check-in;
    - restore a cancelled or no-show booking;
    - correct departure date and charges;
    - transfer a guest to another room;
    - correct or void a manual payment;
    - approve checkout with an outstanding balance.
  - **Refunds:** record a refund.
  - **Payment history:** **Record Payment**.
- **Room actions** (check in/out, extend, shorten) are **not available on this page**; they exist only on the Reservations list.

### Create a reservation
1. **New Booking** (Reservations, or Dashboard quick action / `?new=1`) opens a 3-step modal ([ReservationModal.jsx](../../frontend/src/components/reservations/ReservationModal.jsx)).
2. **Step 1 "Dates & Room":** check-in and check-out dates, then a grid of free rooms with room-type filter chips. Tap one or more rooms (several rooms = one multi-room booking, one code).
3. **Step 2 "Guest":** type a phone number to find an existing guest. An unknown number offers **Register new guest**; "Guest has no phone number" opens the form without a phone. Booking source (Walk-in / Phone / Direct, optional) and notes (optional).
4. **Step 3 "Confirm & Pay":** summary and total; optional "Record Initial Payment now" (amount optional, method, reference).
5. **Save Reservation**, then a receipt option.

Occupant names per room are not asked for here; they're entered at check-in.

### Locate a reservation
Type the code, name, phone or room number in the Reservations search. Dashboard rows link straight to it. There's no global search in the top bar.

### Check in
- **Single-room booking:** row **Check in** opens the occupant dialog.
  - Fields: occupant name (required) and phone.
  - It warns if the occupant matches another active stay.
  - If the room isn't Clean/Inspected, a "check in anyway" tickbox is required.
- **Multi-room:** row **Check in N rooms** only expands the rooms panel. Each room then needs its own **Check In Room** and its own occupant dialog.
- A booking-level check-in endpoint exists (`POST /reservations/:id/check-in`, requiring an occupant on every room) but **no screen uses it**.

### Check out
Row **Check out** (single room) or **Check Out Room** (per room card) runs this logic (`startCheckOut`):
- **Before the booked departure date:** the "Guest is checking out early" dialog. Choose "Keep original charges", or "Shorten stay and recalculate charges" (departure = today, or tomorrow if the guest arrived today; disabled for 1-night bookings).
- **Booking balance owed:** the "This guest still owes GHS X" dialog. Choose **Take payment first**, or **Check out with money owed** with a required reason (four preset reasons or Other). The debt stays on the booking, and the booking appears under "Owed after checkout".
- **Otherwise:** a confirm dialog. If late, it shows "Late departure: X after the checkout time. No extra night is charged." with an optional note.
- **Effect of checkout:** the room becomes Available and "Dirty" (needs cleaning), and the actual checkout time is recorded.
- **Multi-room:** row **Check out N rooms** only expands the panel; each room is checked out separately. A booking-level checkout endpoint exists (`POST /reservations/:id/check-out`) but **no screen uses it**.

### Extend
Room card **Extend** (or checkout reminder **Extend**) opens the "Extend Room X" dialog: quick buttons for +1/+2/+3/+7 nights, or a date picker. Then **Continue**, a confirm step, and the room is extended at the agreed nightly rate. This is per room.

### Shorten
- **From the room card:** **Shorten** opens the "Shorten Room X" dialog: "Leave on the earliest date" or a date picker (only unused nights can be removed), then **Preview** (old and new total) and **Shorten stay**. If the guest has now overpaid, the dialog shows the amount and a **Record refund** link.
- **From early checkout:** also available via the early-checkout dialog.
- Both use the "correct departure date" correction.

### Change rooms
Booking details → **Correct or undo actions** (collapsed) → "Transfer guest to another room" → pick the room stay and an available clean room → reason → preview → apply. This isn't available from the Reservations list or the room card.

### Payments and balances
- **Take payment:** on a booking row, the dashboard or the owed lists. It opens the "Take payment" dialog: amount (empty, with the balance as a hint), method, reference and notes. Overpaying isn't allowed.
- **Booking details:** Payment history → **Record Payment**.
- **Payments page:** none; `/payments` redirects to Reservations.
- **Balance shown on:** the booking row ("Due: X"), the dashboard tiles, Owed lists and receipts.

### Cancel and refunds
- **Cancel:** on Pending/Confirmed bookings with nobody checked in, a confirm dialog **cancels the whole booking**. There's no way to cancel one room of a multi-room booking.
  - If the button is used on an in-house booking, the server explains: "This booking can't be cancelled because the guest is already checked in to Room X. If the guest is leaving, use Check out…"
- **Non-refundable policy** (hotel setting, **on by default**, switched in Properties):
  - On: cancelling keeps the money (no refund due).
  - Off: the amount paid becomes a refund due.
  - Guests see the policy on the public hotel page, the checkout page and the cancel dialog.
- **Refund:** booking details → **Refunds** section. Pick the original payment, amount and reason; confirm the money was returned (method, reference, date). If the hotel is non-refundable, a tick "exception to the policy" is required. Receptionists and managers do this directly, with no approval.
  - The **Refunds page** lists requests: waiting (older ones), to return, and history.

### No-show
After check-in time + 6 h on the arrival day: the row **No Show** or dashboard **Mark no-show** opens a confirm with an optional reason. Rooms are released and the payment stays on the booking.

### Late departures
- **Checkout reminders and the Overdue tile** show rooms past the checkout time.
- **Verify** records whether the guest is still there. Escalations flag the room for the manager.
- **Checking out late never adds a charge.** If the guest actually left earlier, "record actual departure" is a manager-only correction.

### Room cleaning
- **After checkout:** the room is set to "Dirty", shown as "Needs cleaning".
- **Making it clean again:**
  - Rooms & Inventory toggle;
  - Housekeeping page, if enabled;
  - dashboard Needs attention → **Mark clean**.
- **Checking in to an unclean room** needs an explicit confirmation.

### Correcting mistakes
Booking details → **Correct or undo actions**: pick an action, a reason and a preview, then apply. Receptionists can apply all of these directly except record departure and online-payment corrections, which become requests for a manager.

---

## 5. Multiple-room reservations

- **One booking, one code, one guest, one balance.** Each room is a separate room stay with its own status, occupant, dates and nightly price. Rooms can have different departure dates after an extend or shorten on one room.
- **On the Reservations list:**
  - the booking is **one row**, with rooms listed as "102, 103, 808";
  - the row's status is the booking status (InHouse as soon as one room is checked in);
  - per-room status is **only visible after expanding** "View assigned rooms";
  - the row buttons read "Check in 3 rooms" / "Check out 2 rooms", but they **only open the panel**; they don't check anyone in or out.
- **Room-level actions** (check in, check out, extend, shorten, occupant) are done **one room at a time** in the expanded panel.
- **Booking-level actions:** take payment, cancel (the whole booking), no-show (the whole booking), refunds, corrections and printing receipts.
- **Partial checkout** (some rooms out, others in): the booking stays `InHouse`. Room cards show `CheckedOut` vs `CheckedIn`. The dashboard lists only the remaining in-room rooms as in-house; checked-out rooms appear under "Checked out today".
- **Money when checking out one room of several:**
  - The owed check runs on the **whole booking balance**. If anything is owed, checking out even the first room opens the "This guest still owes GHS <whole booking balance>" dialog. Staff must then take payment or give a "money owed" reason, even though the other rooms are still occupied.
  - The checkout is then logged as `CreditCheckoutApproved`.
- **Early checkout for one room** offers to shorten that room's stay; the booking total is recalculated.
- **On the dashboard:**
  - each room of a multi-room booking is a **separate row** with no booking code;
  - the **same booking balance repeats** on every row;
  - each row's **Take payment** opens payment for the whole booking.
- **On the booking details page:** rooms are listed **without status and without actions**.
- **Cancel / no-show** apply to the whole booking; individual rooms can't be cancelled or marked no-show.

---

## 6. Where codes, names, rooms and statuses appear

| Place | Booking code | Guest | Room(s) | Status |
|---|---|---|---|---|
| Reservations list (desktop and phone) | ✓ | ✓ + phone | ✓ (list) | booking status (raw label) |
| Expanded rooms panel | ✓ in header | occupant per room | ✓ per card | room status (`CheckedIn` etc.) |
| Booking details page | ✓ (title) | ✓ | ✓ (no status) | booking status |
| Dashboard arrival/departure/overdue/in-house rows | ✗ | ✓ | ✓ | implied by the list |
| Dashboard "Collected today" rows | ✗ | ✓ | ✗ | – |
| Dashboard "Owed after checkout" | ✓ | ✓ | ✓ | – |
| Checkout reminder cards | ✗ (used in the link only) | ✓ | ✓ | due/overdue badge |
| Take payment dialog | ✓ | ✓ | ✗ | balance |
| Reports payment entries | ✓ (guest / booking column) | ✓ | ✗ | – |
| Refunds page | ✓ | ✓ | – | request status |
| Receipts | ✓ (prominent box) | ✓ | ✓ | – |

**Search** (Reservations page only) finds a booking by code, partial code, guest name, phone or current room number. Searching by room number matches the room currently assigned; old room numbers aren't searched.

---

## 7. Factual usability issues observed

1. **Multi-room "Check in N rooms" / "Check out N rooms" don't act.** They only expand the panel; each room then needs its own button and dialog. The booking-level endpoints exist but aren't used.
2. **Per-room status is hidden** until "View assigned rooms" is expanded. The row status (`InHouse`) doesn't show that some rooms are out.
3. **Booking balance repeats on every room row on the dashboard,** which can read as several separate debts.
4. **The checkout money-owed check uses the whole booking balance,** even when other rooms stay. Partial checkouts of unpaid group bookings always need the "money owed" reason.
5. **No booking code on most dashboard rows.** Only room and guest name show, so two bookings for the same guest look alike (the screenshots show several "ABRAHAM Legend" bookings).
6. **Dashboard actions leave the dashboard** (except Mark clean and Mark no-show). After each check-in or checkout the user lands on the Reservations page and must navigate back to handle the next one.
7. **No bulk checkout or check-in** across several departing rooms or bookings.
8. **The booking details page has no room actions** and no room status. Room actions exist only on the Reservations list; room transfer exists only on the details page, inside a collapsed section.
9. **Important tools are inside collapsed sections** that start closed on every visit: "Correct or undo actions" (transfer room, undo check-in/out, restore, correct dates), Refunds and Payment history.
10. **Raw status labels:** `InHouse`, `NoShow`, `CheckedIn`, `CheckedOut`, `Reserved` appear without spacing or plain wording.
11. **Two different "check out" entry points,** the row button and the room-card "Check Out Room", plus a third via checkout reminders. The same applies to check-in. They lead to the same dialogs.
12. **Several payment entry points:** row Take payment, dashboard rows, owed lists, and details → Payment history → Record Payment, with slightly different dialogs.
13. **Manager-view tiles aren't clickable;** only the attention list and "Open full reports" navigate.
14. **"Rooms free tonight → New booking"** opens an empty form; the room tapped isn't pre-selected.
15. **The Manager/Front desk choice is stored per device,** not per account.
16. **Properties shows for receptionists** with no permission check.
17. **The Calendar page exists but isn't reachable from the menu.**
18. **Pending online holds and future arrivals don't appear on the dashboard.**
19. **The Housekeeping menu depends on two settings** (hotel housekeeping enabled + user permission), so it may be missing without explanation.

---

## 8. Scenarios (actual behaviour)

**A. Three guests arrive for one booking with three rooms.**
1. Dashboard → Arrivals: **three rows** (Room 102, 103, 808 · same guest name, no code), each with **Check in**.
2. Tap Check in on one row. The app goes to Reservations with the booking found and that room's occupant dialog open.
3. Enter the occupant name (and phone), tick if the room needs cleaning, confirm. That room becomes CheckedIn and the booking InHouse.
4. For the next room, either go back to the dashboard and tap the next row, or on the Reservations page expand "View assigned rooms" and tap **Check In Room** on the next card. Repeat for the third room.

That's three separate dialogs, and there's no "check in all".

**B. One room of three checks out; two stay.**
1. Reservations → find the booking → **Check out 3 rooms** (only expands) → on the leaving room's card, **Check Out Room**.
2. **Before the departure date:** the early-checkout dialog asks to keep charges or shorten that room.
3. **If the booking owes anything:** the owed dialog shows the **whole booking balance** and asks to take payment first or give a reason, even though two rooms remain.
4. After checkout, that card shows CheckedOut, the room needs cleaning, and the booking stays InHouse with "Check out 2 rooms".
5. On the dashboard, the room moves to "Checked out today"; the other two stay in "Guests in house".

**C. Find a booking by code and take payment.**
Reservations → type the code (or part of it) in the search → the row shows "Due: X" and **Take payment** → dialog → enter the amount (empty, balance as a hint), method, optional reference → save. The row updates, and the dashboard figures refresh. There's no code search on the dashboard.

**D. A manager notices an outstanding balance.**
1. Manager view → "Owed by guests still here" or "Owed by guests who left". These tiles aren't clickable; use the "Needs your attention" link ("N guests left owing…", which goes to Reservations filtered to Completed) or switch to the Front desk view and open the **Owed after checkout** / **Owed by guests in house** drawers.
2. Owed after checkout rows show the code, reason and approver, with **View payments** (booking details) and **Take payment**.
3. On booking details, the manager opens the collapsed **Payment history** section. The audit trail (who did what) is under Reports → Daily overview → "Activity and correction history", by date.

**E. Check out several departing guests quickly.**
Dashboard → Departures → each row's **Check out** goes to Reservations with that room's checkout dialog open. Each checkout is its own dialog (early, owed or confirm). After each one, the user is on the Reservations page; for the next, they return to the dashboard or find the next booking in the list. Alternatively, filter or scroll the Reservations list and use each row's **Check out**. There's no multi-select or bulk checkout.

**F. A manager finds and resolves urgent issues.**
- **Manager view:** "Needs your attention" lists approvals, refunds, guests who left owing and rooms to clean (links only).
- **Front desk view:**
  - Overdue checkouts tile and Checkout reminders cards (Check Out / Extend / Verify; escalated items marked "Needs manager attention");
  - Needs attention (Mark clean in place);
  - Approvals summary → Approvals page (approve/reject, including record-departure requests).
- Each fix happens on its target page.

---

## 9. Source references

**Frontend**
- Navigation: [Sidebar.jsx](../../frontend/src/components/layout/Sidebar.jsx), [Topbar.jsx](../../frontend/src/components/layout/Topbar.jsx), [App.jsx](../../frontend/src/App.jsx)
- Dashboard: [DashboardPage.jsx](../../frontend/src/pages/DashboardPage.jsx), [TodayAtAGlance.jsx](../../frontend/src/components/dashboard/TodayAtAGlance.jsx), [ManagerDashboard.jsx](../../frontend/src/components/dashboard/ManagerDashboard.jsx), [CheckoutAlerts.jsx](../../frontend/src/components/reservations/CheckoutAlerts.jsx), [DailyOverview.jsx](../../frontend/src/components/DailyOverview.jsx), [ReportsPage.jsx](../../frontend/src/pages/ReportsPage.jsx)
- Reservations: [ReservationsPage.jsx](../../frontend/src/pages/ReservationsPage.jsx) (`rowActions`, `startCheckOut`, URL `do=` handler), [RoomCard.jsx](../../frontend/src/components/reservations/RoomCard.jsx), [ReservationDetailsPage.jsx](../../frontend/src/pages/ReservationDetailsPage.jsx), [ReservationModal.jsx](../../frontend/src/components/reservations/ReservationModal.jsx)
- Dialogs: [EarlyCheckoutDialog.jsx](../../frontend/src/components/reservations/EarlyCheckoutDialog.jsx), [CheckoutOwingDialog.jsx](../../frontend/src/components/reservations/CheckoutOwingDialog.jsx), [ExtendStayDialog.jsx](../../frontend/src/components/reservations/ExtendStayDialog.jsx), [ShortenStayDialog.jsx](../../frontend/src/components/reservations/ShortenStayDialog.jsx), [TakePaymentDialog.jsx](../../frontend/src/components/reservations/TakePaymentDialog.jsx), [RefundPanel.jsx](../../frontend/src/components/reservations/RefundPanel.jsx), [ReservationRecoveryPanel.jsx](../../frontend/src/components/reservations/ReservationRecoveryPanel.jsx)
- Link helper: [bookingLink.js](../../frontend/src/lib/bookingLink.js)

**Backend**
- Stay lifecycle, cancel, corrections: [recovery.service.ts](../../backend/src/modules/reservation/recovery.service.ts) (`transitionStay`, `checkoutBooking`, `checkinBooking`, `cancelSafely`, `balanceApproval`, `correctBookingInTransaction`)
- Permission rules: [correction-policy.ts](../../backend/src/modules/reservation/correction-policy.ts), [financial-delegation.ts](../../backend/src/modules/reservation/financial-delegation.ts), [invitation.service.ts](../../backend/src/modules/user/invitation.service.ts)
- Refunds and policy: [refund.service.ts](../../backend/src/modules/reservation/refund.service.ts), [refund-policy.ts](../../backend/src/modules/reservation/refund-policy.ts)
- Dashboard data: [glance.service.ts](../../backend/src/modules/dashboard/glance.service.ts), [owed-after-checkout.service.ts](../../backend/src/modules/dashboard/owed-after-checkout.service.ts), [checkout-alerts.service.ts](../../backend/src/modules/reservation/checkout-alerts.service.ts), [daily-overview.service.ts](../../backend/src/modules/reports/daily-overview.service.ts)
- Search: [reservation.repository.ts](../../backend/src/modules/reservation/reservation.repository.ts) (`findReservations` search filter)
- Routes: [reservation.routes.ts](../../backend/src/modules/reservation/reservation.routes.ts)
