# Hotel simulation runbook

## Isolated environment

Create everything under a session scratch directory named `sim/` outside the repository.

1. Export the selected commit with `git archive <commit>` into `sim/app`.
2. Use uniquely named simulation resources:
   - network: `hideout-sim-net`
   - database container: `hideout-sim-db`
   - API container: `hideout-sim-api`
   - database: `hideout_sim`
   - volumes: `hideout-sim-pgdata` and `hideout-sim-nm`
   - API: `127.0.0.1:3100`
   - frontend: `127.0.0.1:5180`
3. Never reuse or alter `hotel_pms_db`, `hotel_pms_pgadmin`, or another existing container.
4. Use simulation-only secrets and set `STAFF_EMAIL_MODE=simulation`.
5. Run `npx prisma migrate deploy` only against `hideout_sim`.
6. Start the frontend with `VITE_API_URL=http://127.0.0.1:3100/api` and open `http://localhost:5180` in the browser.

## System-level simulated time

Use this only when the built-in test clock is insufficient.

- Base the database image on PostgreSQL 15 and install `faketime`.
- Base the API image on Node 22 slim and install `faketime`, OpenSSL, CA certificates, and curl.
- Restart both simulation containers for each simulated date with:
  - `LD_PRELOAD=/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1`
  - `FAKETIME=+<offset seconds>`
  - `FAKETIME_DONT_FAKE_MONOTONIC=1`
- Set `PRISMA_CLIENT_ENGINE_TYPE=binary` for the simulated API.
- Advance time only. Never move the database backwards.
- Keep a `sim/setday.sh <UTC ISO time>` helper so each date change is repeatable and logged.

## Plan before Day 1

Write `sim/expected-results.md` and obtain one approval. Include:

- the commit, simulated period, hotel, rooms, room types, rates, and staff roles;
- each day's planned arrivals, departures, bookings, cancellations, payments, refunds, room changes, housekeeping, maintenance, and cash count;
- expected payments, refunds, net collections, balances owed, room nights, occupancy, ADR, RevPAR, revenue by room type, and closing cash.

## Daily coverage

Use a realistic mix across the approved period:

- walk-ins, advance bookings, and group bookings;
- cash, card, and mobile-money payments;
- check-in, guest out/back, extension, shortening, room moves, and refused moves;
- normal, early, and late departures; checkout with a balance and partial group checkout;
- cancellation, refund, no-show expiry, late arrival, and later debt collection;
- rooms needing cleaning, rooms marked ready, maintenance, cash counts, dashboards, and reports.

After each simulated day, compare visible results with the expected figures and record the page, actual value, expected value, and reproduction context for every mismatch.

## Final report

Write `sim/final-report.md` with:

1. What was tested: commit, environment, hotel, staff, and period.
2. A concise table of what happened each day.
3. Expected versus actual final figures, using clear pass/fail markers.
4. What worked correctly.
5. Findings ordered by impact, with evidence and likely code location when obvious.
6. Environment limitations that are not application defects.

Do not fix issues or append implementation proposals during the simulation report.

## Cleanup

Only when explicitly requested:

- stop the simulation frontend;
- remove `hideout-sim-api`, `hideout-sim-db`, and `hideout-sim-net`;
- remove `hideout-sim-pgdata`, `hideout-sim-nm`, `hideout-sim-node`, and `hideout-sim-pg`;
- preserve the final report unless the user explicitly asks to remove it.
