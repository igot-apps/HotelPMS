Render demo data
================

Run manually from the backend directory, never as a build or startup command.
The script adds missing demo hotels in individual transactions. Existing hotels,
staff passwords, rooms, bookings, and payments are never updated. A username or
email conflict rolls back that hotel and stops the command. Reruns skip completed
hotels. No guest accounts, bookings, payments, or payment keys are created.

After deployment, open the API service's Shell and run:

    npm run prisma:seed-render-demo

This previews the target hostname and proposed additions without writing data.
Use that hostname below (not the website hostname):

    DEMO_SEED_CONFIRM_HOST='your-database-host' DEMO_SEED_PASSWORD='123456789' npm run prisma:seed-render-demo -- --apply

The shell must have DATABASE_URL configured. Apply the normal Prisma migrations
and generate the client before running this script. Photos are bundled in Git.

If Render Shell is unavailable, run the same npm command locally with DATABASE_URL
set temporarily to Render's External Database URL. In PowerShell use:

    $env:DATABASE_URL = 'your-render-external-database-url'
    npm run prisma:seed-render-demo
    $env:DEMO_SEED_CONFIRM_HOST = 'hostname-printed-by-preview'
    $env:DEMO_SEED_PASSWORD = '123456789'
    npm run prisma:seed-render-demo -- --apply

Do not commit database URLs or put them in chat. Close the terminal afterward to
clear temporary environment variables. Demo listings are publicly visible for
30 days on trial. Shared platform payment configuration can still apply to them;
use test payment configuration when testing. Staff usernames are manager_hotel01
and receptionist_hotel01 (01 through 11). Existing matching hotels are skipped,
including any that were intentionally hidden or deactivated.
