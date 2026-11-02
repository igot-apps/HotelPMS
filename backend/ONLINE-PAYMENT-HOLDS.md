# Online payment holds

Website bookings start as Pending with a 10-minute payment window measured from
their original creation time. Retrying payment does not extend that window.
Pending holds block the allocated room's dates in public and staff availability.
Verified payment confirms the booking.

Unpaid Website bookings without a staff creator expire automatically, including
older Confirmed website bookings with no payment. Staff-created reservations,
partially paid bookings, and rooms with recorded check-in are excluded. Completed
payment history also protects a booking if its cached balance is inconsistent.

Expiry changes the booking to Expired and reserved allocations to Cancelled. It
does not change a physical room's occupancy or housekeeping status. Records and
expiry history remain available. Existing ReservationStatus.Expired is reused;
no database migration is needed.

Cleanup runs every 30 seconds while the API is active, on public requests, and
before new room allocations and staff availability checks. Sleeping servers
catch up on the next public request. Each cleanup processes up to 200 oldest
eligible holds; larger backlogs drain over subsequent passes.

Payment settlement and expiry lock the same booking row. Payments received after
expiry are recorded once and flagged as refundDue/Pending. They never reclaim
released inventory or automatically send refunds. The payment return screen
explains that the room is not confirmed and hotel refund review is required.

Guests can also cancel their own Website bookings from My Reservations before
check-in. Cancellation requires confirmation and a selected/custom reason. Paid
amounts and original payment history remain intact, with any refund flagged for
hotel review under its policy. In-house, completed, expired, and previously
occupied bookings cannot be cancelled through the guest endpoint. Repeated
cancellation requests are idempotent and cancellation never changes a physical
room's occupancy or housekeeping status.

Local end-to-end verification (temporary fixtures, mocked Paystack):
`npx ts-node --transpile-only scripts/verifyGuestCheckout.ts`
