Hotel operations correction workflows
====================================

Open a reservation's details and use Correct or undo actions. These corrections
require an active Manager account, a selected or custom reason, and support a preview before
confirmation. Confirmation rechecks conflicts and rejects an outdated supplied
preview version. Before/after data and the acting manager remain in correction
history. Regular checkout is available to authorized staff only when settled;
managers may approve a credit checkout without erasing the outstanding debt.

Supported manager actions:
- Undo mistaken check-in, returning the stay to Reserved while preserving charges
  and payments. The released room requires housekeeping review before check-in.
- Undo mistaken room checkout, provided the room has not been reused, become
  unavailable, or been allocated to a conflicting guest.
- Restore a cancelled, unoccupied reservation only if inventory is available and
  no payment has been refunded. Unprocessed cancellation refund flags are cleared.
- Shorten, extend, or correct a departure date, with revised totals and credit
  shown in the preview. Existing effective tax/adjustment proportions are retained.
- Transfer an in-house guest to an available clean room. The agreed price stays
  unchanged; the original assignment is kept in history; the old room becomes dirty.
- Correct or void a completed manual payment. Its original amount is preserved
  with Voided status; a replacement is linked through notes and correction history.
  Paystack-verified RES- payments cannot be edited this way.
- Approve a room checkout on credit, with a manager reason.

Corrections are bookkeeping operations. They do not initiate provider refunds or
cash disbursement. Credits from shortening a paid stay are retained as refundDue
with Pending status for manual review; the cancelled-booking refund action is not
an active-stay credit payout action. Existing inconsistent ledgers are rejected
for correction and need reconciliation instead of being silently overwritten.

Cancellation releases the reservation allocation, never another stay's physical
occupancy. Booking allocation and recovery use serializable transactions and room
locks, with retries on serialization conflicts. Manual payments and settlement
lock the booking while updating payment history and paid balances atomically.

Deployment: apply `npx prisma migrate deploy`, regenerate Prisma with
`npx prisma generate`, and build normally. Migration
20261101010000_payment_corrections adds PaymentStatus.Voided. It was applied to the
local database; Render still needs its normal migration deployment step.

Local regression scenarios (temporary fixtures; no real provider calls):
`npx ts-node --transpile-only scripts/verifyHotelRecovery.ts`
