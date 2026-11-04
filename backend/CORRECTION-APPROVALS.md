# Staff corrections and manager approvals

Managers open **Staff Management → Approval requirements** beside a receptionist.
The four optional grants are undo check-in, undo checkout, restore cancellations,
and transfer rooms. All four are allowed by default for new receptionists. A checked
box requires manager approval; an unchecked box allows direct correction. Financial
actions require approval by default, with optional bounded delegation described below.
Migration `20261104090000_default_room_corrections`
updates existing receptionists only when a manager has never saved their requirements,
preserving explicit manager choices. Apply it on deployment with `npx prisma migrate deploy`.
Changing a grant affects the next correction attempt, including an existing preview.
Grants belong to the individual staff member, not the shared Receptionist role.

All staff can preview a correction on a reservation. Staff without the required grant
see **Send for manager approval**. Requests preserve the input, requester, reason,
booking version and room labels. Sending a request does not change the booking.
There can be one pending request per requester per reservation. Staff can withdraw
their own request and submit a replacement.

Managers see pending requests on their dashboard and in each reservation. They
choose **Review impact**, then **Approve and apply**, or reject with a predefined
or custom reason. Staff see their own request status on their dashboard and booking.
Lists refresh every 30 seconds; access labels refresh every 15 seconds and on focus.
The backend always checks current account access and grants independently of labels.

Managers also have a central **Approvals** inbox with Pending and History views,
search by contact/booking/room/requester, action and reviewed-status filters, and
20-item pagination. Pending requests are oldest first. A side panel (full screen
on phones) reviews impact and applies or rejects requests without leaving the
inbox. Changed reservation versions are flagged and cannot be approved as stale.
The sidebar, mobile header and dashboard shortcut share an exact pending count,
refreshed every 15 seconds and invalidated immediately after local decisions.
The inbox refreshes every 30 seconds and open details every 15 seconds. These
endpoints verify the current active Manager account and hotel on every call.

Undo check-in, undo checkout, departure corrections and credit checkout support
multiple room selections, including **Select all eligible rooms**. A group uses one
preview, one approval request and one transaction. All selected rooms must pass
validation, and any failure rolls back the entire group. Departure changes calculate
the combined booking total once. Unselected rooms retain their state and dates.
Room transfers require one source/destination pair at a time. Restoration applies
to the whole cancelled reservation; payment corrections select one ledger entry.

Managers can delegate departure corrections (maximum reduction per correction),
manual payment corrections (both original and replacement amounts within the limit,
only the receptionist's own payments recorded today in the hotel time zone), and
credit checkout (maximum outstanding balance across the booking). Enabling access or
increasing a limit requires explicit confirmation and the current manager password.
Lowering limits or revoking access takes effect on the next correction. Preview
returns eligibility; out-of-limit corrections can be sent for approval. Limits are
checked again during application; reasons, originals and daily activity are retained.
Refund approval remains manager-only. Refund processing remains a separate workflow; requests do not issue
provider refunds. Correction history records both the original requester and the
manager who applied the correction, alongside the existing before/after audit.

Approval applies the stored input and updates the request status in one serializable
transaction, with bounded retries. Room availability, occupancy and balances are
validated again. A changed booking invalidates the request; it must be rejected or
withdrawn and resubmitted. Duplicate approvals cannot apply a correction twice.

## Deployment

Apply `npx prisma migrate deploy`, run `npx prisma generate`, build and restart the
backend before deploying the frontend. Migration `20261103120000_correction_approvals`
adds `users.correctionPermissions` and `correction_requests`. No role reseeding is
required. Local migration has been applied; the Render database requires deployment.

Migration `20261104100000_financial_delegation` adds a JSON field defaulting to `{}`;
no receptionist receives financial delegation automatically. Apply migrations and
generate the Prisma client before building the backend. Passwords are compared to
the current manager's hash and never recorded in the permission audit.

## Verification

`npm test -- --runInBand` covers policy and existing regressions.
`npx ts-node --transpile-only scripts/verifyCorrectionApprovals.ts` runs only against
localhost, creates isolated hotel fixtures, exercises HTTP authentication, grants,
revocation, concurrent approval, ledger preservation, stale requests, rejection,
withdrawal and restoration conflicts, then removes its fixtures in `finally`.
`npx ts-node --transpile-only scripts/verifyMultiRoomCorrections.ts` additionally
checks grouped approval, combined repricing, unchanged unselected rooms and actual
database rollback after an injected failure on the second room update.
