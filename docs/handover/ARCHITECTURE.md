# Architecture

## Stack
| Part | Tech |
|---|---|
| Backend | Node 24, **Express 5**, TypeScript (ts-node in dev, `tsc` → `dist/` in prod) |
| Database | **PostgreSQL** via **Prisma 6** (client generated to `backend/src/generated/prisma`) |
| Frontend | **React 19**, **Vite 8**, Tailwind CSS 3, TanStack Query 5, axios, react-hot-toast, lucide-react |
| Payments | Paystack (per-hotel secret key for guest bookings; platform key for subscriptions) |
| Email | Resend |
| SMS | Moolre (sender ID `HideOut24`) |
| Tests | Jest + ts-jest + supertest (backend only) |

## Folders
```
HotelPMS/
  AGENTS.md, CLAUDE.md        rules for AI assistants
  package.json                root: `npm run dev` runs backend + frontend together (concurrently)
  backend/
    prisma/schema.prisma      data model
    prisma/migrations/        SQL migrations (applied with `prisma migrate deploy`)
    prisma.config.ts          loads .env, points Prisma at DATABASE_URL
    src/app.ts                Express app, all route mounts
    src/modules/<area>/       routes + controller + service + repository per area
    src/shared/               auth middleware, subscription middleware, utils (prisma, jwt, ghanaPhone…)
    scripts/                  one-off/admin scripts (bootstrap platform admin, verifiers, Studio helper)
    tests/                    Jest tests (prisma is mocked)
  frontend/
    src/App.jsx               all routes
    src/pages/                one file per screen
    src/components/           grouped by area (reservations, rooms, users, public, catalog…)
    src/api/                  thin axios wrappers per area
    src/lib/axios.js          axios instance: base URL, token attach, 401 handling, error toasts
    src/store/authStore.js    staff session (zustand)
  docs/                       documentation (this folder)
```

## Backend modules (`backend/src/modules`)
auth, property (incl. platform admin + website domains), room (rooms, room types, rate plans,
maintenance, online toggle), reservation (booking creation, check-in/out, corrections,
approvals, refunds, holds, no-show), payment (desk payments, guest Paystack payments,
subscriptions, free access), guest, public (guest auth, public website, profile), housekeeping,
notifications (SMS), reports, dashboard, user (staff, invitations, permissions), amenity.

API mounts are in `src/app.ts`: everything is under `/api/...`; public website routes are
`/api/public/...` (guest auth at `/api/public/auth/...`). Paystack webhooks use raw bodies.

## Auth — two separate systems
1. **Staff**: JWT access + refresh tokens (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`).
   `authenticate` middleware; `requirePermission('Code')` checks the role's permissions.
   Roles: **Manager**, **Receptionist**, **Housekeeper** (limited to housekeeping routes),
   **Platform Admin**. On top of role permissions, receptionists have per-user settings set by a
   manager: `correctionPermissions`, `financialDelegation` (money limits) and
   `canManageOnlineRooms`.
2. **Guests** (public site): their own JWTs signed with `JWT_SECRET`.
   - `hotel_guest` token: account scoped to one hotel (`HotelGuestAccount`: propertyId + email,
     own password, `sessionVersion`).
   - `central_guest` token: HideOut24-wide account (`PlatformGuest.centralPasswordHash`).
   - `requireBookingGuest` (in `public.routes.ts`) validates both.
   - Frontend keeps guest session in `localStorage` keys `guestToken` / `guestInfo`, separate
     from the staff store.

## Frontend request flow
`src/lib/axios.js` picks the token by path: `/public/*` → guest token, everything else →
staff token. A **401 on a `/public/*` request clears the guest session** (signs the guest out).
Errors show a toast unless the request passes `{ skipErrorToast: true }`.

## Hotel websites / domains
- `HotelWebsiteGate.jsx`: if the browser host is not a central host, look up the hotel by
  hostname and restrict routes to that hotel's public pages. Central hosts are listed in
  `frontend/src/lib/hotelWebsite.js` and `backend/src/modules/property/website-domain.service.ts`.
- On a hotel domain, `/staff`, `/login`, `/hotel/login` redirect to the central staff login
  (`VITE_STAFF_APP_URL`, default `https://hotelpms-frontend.onrender.com`).
- Custom domains are added to the Render frontend service through the Render API
  (`RENDER_API_KEY`, `RENDER_FRONTEND_SERVICE_ID`). Details: `backend/HOTEL-DOMAINS.md`.
- `VITE_SHOW_DISCOVER` (frontend): Discover page is shown unless set to `false`.

## Main data model (Prisma)
Property (hotel: subscription, online booking switch, SMS switch, Paystack key) · User (staff) ·
Role/Permission · Room (operationalStatus Available/Occupied/Maintenance, housekeepingStatus
Clean/Dirty/Inspected, `maintenanceReason`, `isOnlineBookable`) · RoomType · RatePlan ·
Reservation (status Pending/Confirmed/InHouse/Completed/Cancelled/Expired/NoShow, totals,
amountPaid, refundDue) · ReservationRoom (per-room stay, occupant, dates, agreed price) ·
Payment · Refund · CorrectionRequest (approval queue, also refunds) · AuditLog ·
PlatformGuest / PropertyGuest / HotelGuestAccount · GuestPaymentAttempt · SimulatedSms
(all guest SMS, simulated or live).
