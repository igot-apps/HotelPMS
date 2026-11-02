# Guest payment recovery

Deploy migration `20261102010000_guest_payment_attempts` with
`npx prisma migrate deploy`, generate Prisma, then build and start the API.
The migration is additive and has been applied to local development only.

Payment initialization locks the booking and persists a unique attempt reference
before contacting Paystack. Concurrent clicks reuse the same active attempt.
Repeated requests verify that attempt first, return its existing checkout URL
when still pending, and never create a new reference while its outcome is unknown.
Provider-confirmed failed/reversed attempts permit another payment attempt.
If a receptionist records a payment and changes the remaining balance, an older
checkout is superseded only after Paystack confirms it is abandoned. A fresh
checkout uses the current balance. Processing or unknown attempts remain blocked
until their status is resolved. Superseded references remain available for
settlement: an old checkout URL cannot be revoked by this application.
An initialization timeout is treated as unknown, not as proof that no charge exists.

Guests can check payment status from My Reservations. Ownership is verified on
the backend before looking up payment attempts. The return page checks again for
a short period and offers an explicit status retry instead of returning to a
checkout that might charge again. Payment references survive refresh within the
guest's tab, and recorded payments can be verified from the local ledger even
if Paystack is temporarily unavailable.

Checkout keeps its saved booking ID across a payment error and tab refresh,
avoiding a fresh booking on every retry. Browser storage is optional; in-memory
recovery still works if storage is blocked. Guests can always use My Reservations.

Cancellation and settlement lock the same booking row. Whether payment or
cancellation commits first, the payment remains recorded once, allocations stay
cancelled, and the paid amount is flagged for hotel refund review. No refund is
sent automatically and no cancelled booking is silently restored.

Expired unpaid website holds are different from deliberate cancellations. Late
settlement rechecks availability and restores all booked room stays atomically,
using the original room or an available room of the same type. Past arrivals,
inactive hotels, missing inventory, and conflicting allocations are not restored.
The settlement uses serializable isolation, ordered room locks, and bounded
conflict retries shared with booking creation. If no matching room is available,
the booking remains released with the payment recorded and refund review pending.
Guest pages label this as payment received / booking not confirmed. Database
failures roll back the entire settlement; browser status checks and webhook
retries can retry safely without offering a fresh payment attempt.

If a superseded checkout is paid later, its payment is still recorded once.
Any extra amount above the booking total is flagged for hotel refund review,
without cancelling a confirmed booking or losing the receptionist's payment.

Legacy payments initiated before this migration have no saved attempt reference.
Known return references and webhooks still settle idempotently, but the API cannot
discover an old unrecorded provider attempt when its reference was never saved.
Unknown results may require provider/hotel review; the app does not silently
assume that an unavailable provider means payment failed.

Verification with mocked Paystack and temporary local records:
`npx ts-node --transpile-only scripts/verifyGuestCheckout.ts`
