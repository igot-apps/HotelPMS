# Moolre payment webhooks (guest bookings and subscriptions)

Online payments use Moolre mobile money (MTN MoMo, Telecel Cash, AT Money). Paystack is no
longer used; old Paystack payments stay in the history unchanged (`verifiedProvider = 'Paystack'`).

## Callback URL

In Moolre, on each wallet's API Service → **Callbacks** tab, set:

    https://YOUR-BACKEND-HOST/api/payments/webhooks/moolre

It must be public HTTPS on port 443 with a valid certificate and no redirects. The same URL
handles guest bookings (`RES-…` references) and subscriptions (`SUB-…` references).

## Signature

`X-Moolre-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256(wallet secret, `${t}.${rawBody}`), checked on
the raw body, constant-time, rejected if older than 5 minutes.

- Guest bookings: the hotel's own webhook secret (Property → Moolre keys); if the hotel uses the
  platform wallet, `MOOLRE_WEBHOOK_SECRET`.
- Subscriptions: always `MOOLRE_WEBHOOK_SECRET`.

## Safety rules

- The callback is only a hint. Every outcome is re-checked with Moolre's status API before anything
  is recorded, inside the same locked, idempotent settlement used by the guest's browser.
- A booking is credited only when Moolre reports `txstatus 1` and the amount equals the saved attempt.
- Unknown outcomes (timeouts, `TP11`, `TP18`, …) are kept as pending. The same reference is checked
  again; a new reference is never created for an uncertain payment.
- Non-2xx replies make Moolre retry (1m, 5m, 30m, 2h, …).
- Without a webhook secret, payments are still confirmed by status checks (the guest's screen polls).

## Environment

    MOOLRE_ENV=sandbox            # or live; restart the server after changing
    MOOLRE_USER=                  # Moolre username (platform wallet)
    MOOLRE_PUBKEY=                # API Service public key
    MOOLRE_ACCOUNT=               # wallet account number
    MOOLRE_WEBHOOK_SECRET=        # wallet secret, for callbacks

The startup log prints the mode and base URL (`💳 Moolre payments: SANDBOX (...)`).

## Sandbox

Numbers ending 111 succeed, 333 insufficient funds, 777 declined, 222 pending then success.
SMS code `123456`. Tests: `npx jest tests/guest-payment.test.ts tests/moolre-guest-flow.test.ts`.
