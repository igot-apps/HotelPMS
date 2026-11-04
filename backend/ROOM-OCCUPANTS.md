# Room occupants and booking contacts

A reservation's booking contact can reserve several rooms without being the
occupant of every room. Booking creation leaves room occupant fields empty.
The check-in form shows the booking contact separately, asks for the room's main
occupant, and offers **Booking guest is staying in this room** to explicitly copy
the contact details. Existing saved occupant details may be reviewed and edited.
Editing room occupants does not change the booking contact.

Check-in and occupant editing use the same form. Names are required; phone numbers
remain optional. Ghana international phone formats normalize to the local form.
When both normalized name and phone match another checked-in room in this hotel,
the API responds with `409 OCCUPANT_ALREADY_CHECKED_IN`, matching room references
and a confirmation token. A matching name alone does not identify the same person.
For an intentional duplicate the receptionist must tick a confirmation and retry.
Changing identity or matching stay details invalidates the token. Phone-free
records cannot reliably be matched, and are accepted without a duplicate warning.

Checks and writes share a serializable transaction, with property coordination
and bounded conflict retries. Concurrent check-ins for the same identity cannot
silently bypass the warning. The audit retains the acting staff member, previous
occupant details, new details and explicitly acknowledged duplicate room references.
Editing checked-out or cancelled room occupants is rejected to preserve history.
The bulk check-in endpoint requires occupants already assigned to every room;
rooms needing duplicate confirmation must use individual check-in.

Existing occupant entries are preserved. Staff can use **Edit** to correct copies
of a booking contact on older stays. No new database migration is required for
this change. The separate correction-approval migration is still required when
deploying the pending approval feature to Render.

Verification: `npm test -- --runInBand` and
`npx ts-node --transpile-only scripts/verifyRoomOccupants.ts` (localhost only,
isolated fixtures removed in `finally`). The integration covers check-in and
edit HTTP warnings, explicit/stale confirmations, concurrent arrivals, name-only
matches, optional phone numbers, contact preservation and audit history.
