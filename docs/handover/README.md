# HideOut24 / HotelPMS — AI handover

Start here. These notes let a new AI assistant (Claude Code, OpenCode, Cursor, …) work on this
project without the owner re-explaining it. Last updated: 2026-11-16.

## What this is
HideOut24 is a hotel property management system (PMS) for hotels in **Ghana**:
- **Staff app** (managers, receptionists, housekeepers): reservations, check-in/out, rooms,
  housekeeping, payments, refunds, corrections with manager approval, reports, billing.
- **Public booking websites**: each hotel gets `/public/<propertyCode>`, a `<slug>.hideout24.com`
  subdomain and optionally its own domain (e.g. `l400.online`). Guests sign in with email,
  book and pay online with Paystack.
- **Platform admin** (`/superadmin`): manages all hotels, subscriptions, free access, domains.

Currency is GHS. Phone numbers are Ghana numbers, stored as `+233XXXXXXXXX`.

## Read next
| File | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, folders, request flow, auth, key modules |
| [RUNNING-AND-MIGRATIONS.md](RUNNING-AND-MIGRATIONS.md) | Run locally, database migrations, tests, Prisma Studio |
| [DEPLOYMENT-RENDER.md](DEPLOYMENT-RENDER.md) | Render services, IDs, env var names, deploy flow, logs |
| [BUSINESS-RULES.md](BUSINESS-RULES.md) | How bookings, payments, refunds, corrections, SMS, rooms behave |
| [GOTCHAS.md](GOTCHAS.md) | Mistakes already made and how to avoid them |

Older feature notes still useful: `backend/*.md` (REFUNDS, CORRECTION-APPROVALS,
GUEST-PAYMENT-WEBHOOKS, ONLINE-PAYMENT-HOLDS, HOTEL-DOMAINS, STAFF-INVITATIONS, …) and
`docs/hotel-websites.md`.

## Working rules (from the owner — follow them)
The repo's `AGENTS.md` is the rulebook; `CLAUDE.md` just includes it. Summary:
- Be fast, keep answers short and in plain English. Minimal, safe changes; no unrelated refactors.
- **Never change existing business logic unless asked.** Ask when a request is ambiguous.
- **Never delete databases, tables or important files without explicit approval.**
- Run targeted tests, not the whole suite, unless needed.
- `AGENTS.md` must stay tracked in git; never delete, ignore or edit it without permission.
- If work is taking much longer than expected, stop and ask before continuing.

How the owner works with an assistant:
- After a change, the owner decides when to ship. Ask "commit and push?" — they reply
  **"Yes, push"** or **"Not yet"**. Don't push without that yes.
- Pushing to `main` **is** the deploy (Render auto-deploys). See DEPLOYMENT-RENDER.md.
- They test on the live site and send screenshots. After a deploy, tell them to hard refresh
  (**Ctrl+Shift+R**) — browsers keep the old bundle otherwise.
- Staff-facing wording: say **"needs cleaning"**, never "dirty". Keep UI text friendly.
- Commit messages: short summary line, optional bullet body. Commits made by an AI end with a
  `Co-Authored-By:` line for that assistant.

## Never commit or paste secrets
Secrets live only in `backend/.env` (local), `backend/.env.online` (local, Render DB URL for
Studio) and Render's Environment settings. Both files are git-ignored. Docs list variable
**names** only.
