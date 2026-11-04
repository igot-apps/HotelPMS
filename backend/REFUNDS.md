# Refunds

Run `npx prisma migrate deploy` during deployment before starting the updated API. The refund ledger and reference-uniqueness migrations are required.

The receipt/provider reference is optional. Migration
`20261104110000_optional_refund_reference` permits a null reference; regenerate the
Prisma client before building. Blank and whitespace-only values are stored as null
and shown as **Not provided**. Supplied references remain unique per hotel/method;
each approved request can still produce only one refund, including blank-reference retries.

Staff open **Refunds** on a reservation, choose an original payment, amount and reason, then preview and submit. Requests reserve the available refund balance. Managers review them in **Approvals > Pending**. Approval does not move money or alter the balance.

Receptionists have a **Refunds** navigation link with the hotel-wide count approved
and ready to return. The queue opens on **Ready to return**, oldest approval first,
with **Awaiting approval** and **History** tabs, guest/code search and pagination.
Dashboard and reservation banners link to the queue; reservation cards show approved
amounts or pending approval. Counts and lists refresh every 15 seconds and invalidate
after local refund actions. Only active hotel staff can access their hotel's queue.

Approved refunds appear in **Approvals > To return** and on the reservation. After returning the money outside the app, an active receptionist or manager from the same hotel can select **Record money returned**, enter the method, receipt/provider refund reference and return time, and confirm receipt by the guest. The approved amount and original payment cannot be changed during completion. History preserves the manager who approved and the staff member who recorded the return. Paystack returns additionally require confirmation that the provider reports success. This records a separate ledger entry and updates the net paid balance. It does not call Paystack's refund API. Use the actual refund reference, not the original payment reference.

Cancelled and expired reservations can refund their remaining net payments. Active stays can refund overpayments; correct charges first for an early departure or price reduction. Partial refunds are supported. Original payments remain unchanged. Existing legacy refunded records are not rewritten.

Pending requests can be withdrawn or rejected; an approved request can be cancelled before money is recorded as returned. Completed refunds cannot be edited through this workflow. Concurrent completion retries are idempotent; references cannot be reused for the same method within a hotel. Restoring a booking after money was returned is blocked.

Daily collections subtract refunds on their actual return date. Method-based receipt breakdowns still show gross receipts. Guest pages distinguish approval from money actually returned.

Validation: `npm run build`, `npm test -- --runInBand`, and `npx ts-node --transpile-only scripts/verifyRefunds.ts` (isolated local database fixtures only).

## Automated MoMo simulation

Under **Refunds**, managers can switch **Automated MoMo refunds · simulation only**
on or off. It defaults off per hotel. Apply migration
`20261104120000_refund_simulation` and regenerate Prisma before deployment.

With simulation enabled, staff may choose **MoMo · simulation only** when requesting
a refund. A syntactically valid Ghana mobile number must be saved on the booking
contact; the saved recipient is shown in the preview and manager review. GHS only.
Wallet ownership and MoMo registration are not verified. Staff cannot supply an
arbitrary destination in the request, and a phone change requires a new request.

**Approve and simulate MoMo** runs entirely in the approval database transaction.
The request becomes `Simulated`, containing a deterministic `SIM-MOMO-<requestId>`
reference and `moneySent: false`, with an audit entry. Duplicate approvals cannot
run it twice. Switching simulation off blocks pending simulations until enabled again;
managers can reject them and staff can request a manual refund instead.

Simulation now completes the booking test workflow. Apply migration
`20261104130000_simulated_refund_settlement` and regenerate Prisma. Approval creates
one Refund row flagged `isSimulated`, reduces the booking's test paid/refundable
balance, and marks a fully settled refund Processed. Partial simulations retain the
remaining test balance. The result appears as **Sent (simulation)**, and a completed
booking offers **Refund history** instead of **Manage refund**. The original payment
remains intact, and duplicate approvals cannot consume the balance twice.

No provider request is sent. `moneySent` remains false, while `balancesApplied` is
true on the test result. Daily and revenue reports exclude simulated Refund rows;
operational booking balances include them so testing follows the real workflow.
Guest pages also label these amounts as simulated. Keep this setting off when not
testing. Switching it off does not undo prior test settlements. Real automation is
not implemented or activated by this switch.

For earlier local preview-only simulation results, run
`npx ts-node --transpile-only scripts/settleLegacyRefundSimulations.ts`. It applies
only approved test amounts still supported by the current ledger and other pending
requests, and leaves conflicts as preview-only for review. It is local-only and
does not send money. Re-running does not create duplicate refund rows.

`npx ts-node --transpile-only scripts/verifyRefundSimulation.ts` exercises settings,
phone/currency validation, manager approval, stale recipient and disabled-mode checks,
concurrent approvals, partial/full test settlement and unchanged real-money reports
using disposable local fixtures.
