---
name: hotel-simulation
description: Run a multi-day HideOut24 hotel-operations simulation in an isolated Docker environment, drive staff workflows through the browser, compare expected and actual figures, and produce a findings report. Use for simulation runs, test runs, or requests to simulate several hotel days; do not use for ordinary unit tests or production testing.
---

# Hotel operations simulation

Simulate realistic hotel operations against a committed version of HideOut24 and report what the application actually does.

## Required safeguards

- Keep the simulation isolated from production and the developer's normal local database.
- Never use Render, `backend/.env.online`, `hotel_pms_db`, or the normal HotelPMS containers.
- Put generated files, credentials, copied source, and reports in a session-specific temporary `sim/` directory outside the repository.
- Never disclose generated credentials in chat.
- Drive hotel work through the staff UI. Do not call application APIs directly or bypass UI validation.
- Use receptionist access for front-desk work and manager access only for manager-only actions.
- During a simulation, record defects but do not modify the application or fix bugs.
- After the user approves the simulation plan, run through the agreed period without interrupting for ordinary questions. Stop only for safety, authorization, or an unrecoverable environment failure.
- Do not clean up containers, volumes, images, or reports unless the user asks.

## Workflow

1. Read [references/runbook.md](references/runbook.md) completely.
2. Select and record the exact Git commit under test. Copy it with `git archive`; never simulate from an uncommitted working tree.
3. Prepare an isolated database, API, and frontend using unique `hideout-sim-*` names and loopback-only ports.
4. Before Day 1, write `sim/expected-results.md` with the hotel setup, daily events, and expected financial and occupancy figures. Present it once for approval.
5. Advance simulated time forward only, then perform each day's work through the browser as hotel staff.
6. Compare each day's visible figures and reports with the approved expected results. Preserve concise evidence for every mismatch.
7. Write `sim/final-report.md` using the report structure in the runbook, then present that report without offering or applying fixes.

If the repository's built-in test clock can provide the required date behavior across both the API and database, prefer it. Use the `libfaketime` container method from the runbook when database timestamps or automatic jobs also need system-level simulated time.
