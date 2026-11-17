# Running locally, migrations, tests

The owner works on **Windows** (PowerShell and Git Bash both available).

## Run the app
```bash
# both at once, from the repo root
npm run dev

# or separately
cd backend && npm run dev     # API on http://localhost:3000 (nodemon + ts-node, src/app.ts)
cd frontend && npm run dev    # Vite on http://localhost:5173
```
- Frontend calls `VITE_API_URL`, default `http://localhost:3000/api`.
- Backend reads `backend/.env` (PORT=3000, DATABASE_URL = local Postgres, keys…).
- **Stale server trap:** if API changes "don't work locally", check the process on port 3000
  is new. An old process can keep the port so the restarted one never starts:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | % { Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" } | Select ProcessId, CreationDate
  ```
  Ask the owner before stopping it.

## Database migrations (the important part)
The schema is `backend/prisma/schema.prisma`. **Every schema change needs a migration** in
`backend/prisma/migrations/<timestamp>_<name>/migration.sql`. Production applies migrations
automatically when the API starts (`npx prisma migrate deploy && npm start`).

Safe workflow used in this project:
1. Edit `schema.prisma`.
2. Create the migration folder by hand, named with the next timestamp, e.g.
   `20261116030000_room_maintenance_reason_online_toggle/migration.sql`, and write the SQL
   (`ALTER TABLE "rooms" ADD COLUMN ...`). Table names are the `@@map(...)` names
   (`rooms`, `users`, `platform_guests`, `reservations`, …); column names are camelCase in quotes.
3. Apply locally and regenerate the client:
   ```bash
   cd backend
   npx prisma migrate deploy
   npx prisma generate
   npx prisma migrate status   # should say the database is up to date
   ```
4. Restart the backend (the running server keeps the old Prisma client).
5. Commit the migration with the code. Render applies it on the next deploy.

Rules:
- Prefer additive migrations (add columns with defaults, drop NOT NULL). Destructive SQL
  (DROP, data deletes) needs the owner's explicit approval.
- **Do not** run `prisma migrate reset`, `prisma db push --force-reset`, or `migrate dev` if it
  offers to reset the database. **Never** point `--shadow-database-url` at the real local DB
  (it gets wiped).
- Check that `schema.prisma` and the migrations agree. A past bug: `passwordHash` was made
  optional in the schema but never in a migration, so every new guest sign-up failed in
  production with "Null constraint violation".

## Prisma Studio (browse/edit data)
```bash
cd backend
npm run studio:local     # local DB, http://localhost:5555
npm run studio:online    # LIVE Render DB, http://localhost:5556 (edits are real!)
```
`studio:online` reads `ONLINE_DATABASE_URL` from `backend/.env.online` (git-ignored; get the
External Database URL from Render → Postgres → Connect).

## Tests
```bash
cd backend
npx jest tests/<file>.test.ts     # targeted (preferred)
npx jest                          # full suite (~2 min)
```
- Tests mock `../src/shared/utils/prisma`; follow existing files for style.
- If a test sets `process.env.X`, restore it in `afterAll` — leaking `JWT_SECRET` broke
  `guest-auth-scope.test.ts` when run in the same worker.
- Known failing before recent work: `tests/discover-pagination.test.ts` (hotel search
  ordering). Not caused by recent changes; investigate separately if asked.
- Frontend has no tests; verify with `cd frontend && npm run build` (and `npm run lint`, oxlint).
- Backend type check: `cd backend && npx tsc --noEmit -p .`
