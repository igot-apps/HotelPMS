# Deployment (Render)

Hosting is **Render**, workspace "My Workspace". GitHub repo: `igot-apps/HotelPMS`.
**Pushing to `main` deploys** — both services auto-deploy on every commit to `main`.
Only push when the owner says so.

## Services
| | API | Frontend | Database |
|---|---|---|---|
| Render name | `hotelpms-api` | `hotelpms-frontend` | `hotelpms-db` |
| ID | `srv-dbh7nfetlv9c73eqgqbg` | `srv-dbh7u67b9u1s73e7vc3g` | `dpg-dbh6i4mtlv9c73ft3u00-a` |
| Type | Web service (Node), Frankfurt, 0.5 CPU / 512 MB | Static site | Postgres 18, Frankfurt, **free plan** |
| Root dir | `backend` | `frontend` | — |
| Build | `npm install --include=dev && npx prisma generate && npm run build` | `npm ci && npm run build` | — |
| Start | `npx prisma migrate deploy && npm start` | publishes `dist` | — |
| URL | https://hotelpms-api-n24g.onrender.com | https://hotelpms-frontend.onrender.com | internal / external URLs in Render dashboard |

⚠️ The free Render Postgres showed an expiry of **2026-11-27** (Render free databases expire).
Upgrade or migrate before then or data is lost. Confirm in the Render dashboard.

Other suspended services in the workspace (crypto-invest-server, price-alert, etc.) are
unrelated old projects — ignore them.

## Environment variables (names only — values are in Render → service → Environment)
**API (`hotelpms-api`)**
- `DATABASE_URL` — Render Postgres (internal URL)
- `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `JWT_EXPIRES_IN` (optional)
- `NODE_ENV`, `PORT`
- `FRONTEND_URL` — used for links in emails and payment returns
- `PAYSTACK_SECRET_KEY` — platform key (subscriptions); hotels store their own guest-booking key
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GUEST_EMAIL_FROM`, `STAFF_EMAIL_MODE`
- `MOOLRE_SMS_VAS_KEY` — live SMS; without it SMS is only simulated (logged in-app)
- `RENDER_API_KEY`, `RENDER_FRONTEND_SERVICE_ID`, `RENDER_FRONTEND_HOST`,
  `RENDER_CUSTOM_DOMAIN_LIMIT` — adding hotel custom domains to the frontend service
- `PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_PHONE`, `PLATFORM_ADMIN_INITIAL_PASSWORD` — only for
  `npm run prisma:bootstrap-platform-admin`

**Frontend (`hotelpms-frontend`, read at build time — redeploy after changing)**
- `VITE_API_URL` — API base, e.g. `https://hotelpms-api-n24g.onrender.com/api`
- `VITE_STAFF_APP_URL` — central staff login (default `https://hotelpms-frontend.onrender.com`)
- `VITE_SHOW_DISCOVER` — set `false` to hide Discover (currently unset = shown)

## After pushing
1. Render builds both services (frontend ~30 s, API ~1 min; the API also runs migrations).
2. Tell the owner to hard refresh (Ctrl+Shift+R). Open tabs keep the old JavaScript.
3. If something fails, read the API logs (Render dashboard → hotelpms-api → Logs, or the Render
   MCP/CLI). Request lines are logged as `➡️ METHOD /api/...`; Prisma errors as `prisma:error`.

## Domains
- Central: `hotelpms-frontend.onrender.com` (current), planned `hideout24.com` / `app.hideout24.com`.
- Hotel subdomains `<slug>.hideout24.com` are assigned automatically.
- Hotel custom domains (e.g. `l400.online`, hotel "Level 400", code `level-400`) are added from
  Platform Admin → hotel → website/domains. See `backend/HOTEL-DOMAINS.md`.

## Reading production data safely
Use read-only SQL (Render MCP `query_render_postgres`, or `npm run studio:online` and only look).
Writes to production need the owner's approval.
