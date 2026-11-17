# Gotchas (learned the hard way)

1. **Schema vs migration drift breaks production.** A field made optional in `schema.prisma`
   without a migration caused every new guest sign-up to fail ("Null constraint violation").
   Always add a migration for every schema change and run `npx prisma migrate status`.

2. **"Works on Render, not on localhost"** is usually a stale local API process on port 3000
   (old code, old Prisma client). Check the process start time; restart the backend.

3. **"I deployed but nothing changed"** — the browser tab still runs the old JS bundle.
   Hard refresh (Ctrl+Shift+R) or open a new tab. You can confirm what's live by fetching
   `https://hotelpms-frontend.onrender.com/`, finding `assets/index-*.js`, and grepping it.

4. **Don't return 401 for validation errors on `/api/public/*`.** The frontend treats any 401
   there as "session expired" and signs the guest out (e.g. wrong current password → use 400).

5. **Express route order:** `/api/public/:propertyCode` catches unknown public paths, so a
   missing route shows "Property not found" (404) rather than "Route not found".

6. **Tests sharing env vars:** restore any `process.env` change in `afterAll`.

7. **Windows shell quirks:** heredocs with curly quotes or apostrophes can break in Git Bash;
   use the file-write tool for files with prose. Line-ending warnings (LF→CRLF) are harmless.

8. **SMS not received?** Check, in order: hotel's Guest SMS switch, `MOOLRE_SMS_VAS_KEY` on
   the API, that the booking is a fully paid Website booking, and the phone saved on the booking
   (not the guest profile). The Notifications page lists every attempt.

9. **Prisma Studio online = live data.** `npm run studio:online` edits production directly.

10. **Free Render Postgres expires** (shown as 2026-11-27). Remind the owner before then.

11. **`backend/src/modules/room/room.service - Copy-to-be-deleted.ts`** and
    `to-be-deleted-tenant.middleware.ts` are leftovers; don't import them. Deleting them needs
    the owner's approval.

12. **Pending correction requests go stale.** Any change to the booking or its rooms (payment,
    presence, verification) changes its version, so the manager must reject and the receptionist
    re-submit. This is intended.

13. **Stay times on screen use the browser clock** (fine in Ghana); reminders and charges use the
    hotel's time zone on the server.

14. **Root-level scratch files** (`ai-copilot.js`, `gitzen.js`, `temp.js`, `prisma-playground.js`,
    `i-help.md`, `onliine-booking-plan.md`) are the owner's notes/tools, not part of the app.
