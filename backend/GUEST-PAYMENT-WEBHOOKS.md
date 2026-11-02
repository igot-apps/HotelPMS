Guest payment recovery
======================

In each hotel merchant's Paystack dashboard, configure the webhook URL as:

    https://YOUR-BACKEND-HOST/api/paystack/webhooks/guest-bookings

Use the API hostname, not the frontend hostname. Configure the appropriate test
and live environments. The hotel's saved Paystack secret key must match that
merchant; otherwise the platform PAYSTACK_SECRET_KEY is used.

For hotels using the shared platform account, the existing
/api/paystack/webhooks/platform URL also dispatches guest charges. The guest URL
dispatches subscription charges too, so either URL supports both charge types on
the shared account. No additional subscription webhook configuration is needed.

The handler validates HMAC-SHA512 against the raw body and re-verifies payment
through Paystack. Uncommitted/failed processing returns non-200 for provider
retry. Browser callbacks and webhooks share a reservation row lock and transaction
so concurrent repeats apply the same reference only once. A committed payment
does not change the stay status; a late cancelled-booking payment is flagged for
refund review. Existing inconsistent payment records are not repaired by this change.

No schema migration is needed. Replacing the merchant key while payments are
pending can prevent old-account verification; reconcile before rotating keys.
This does not introduce a scheduler for payments whose webhook was never delivered.

Local verification (temporary fixtures, mocked Paystack):

    npx ts-node --transpile-only scripts/verifyGuestWebhook.ts

Provider documentation: https://paystack.com/docs/payments/webhooks/
