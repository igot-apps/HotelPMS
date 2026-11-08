# Hotel website domains

The existing hotel page is reused for every hostname. The backend resolves the hostname to one active property. Paystack return URLs use that same verified hostname.

## One-time infrastructure setup

1. Add `*.hideout24.com` to the `hotelpms-frontend` Render static site. Follow Render's wildcard instructions for the three CNAME records (`*`, `_acme-challenge`, and `_cf-custom-hostname`) at Namecheap. Keep all Resend DNS records.
2. Set `RENDER_API_KEY` only on the backend service. The key must be allowed to manage custom domains on the frontend service.
3. Set `RENDER_FRONTEND_SERVICE_ID=srv-dbh7u67b9u1s73e7vc3g` on the backend.
4. Set `RENDER_FRONTEND_HOST=hotelpms-frontend.onrender.com` on the backend if the default ever changes.
5. Set `RENDER_CUSTOM_DOMAIN_LIMIT` to the maximum number of Render domain entries you are willing to pay for. The default is 2. Count the wildcard and any automatic apex/`www` companions in this allowance.
6. Use the existing `npm run prisma:bootstrap-platform-admin` script once, with `PLATFORM_ADMIN_PHONE` and `PLATFORM_ADMIN_INITIAL_PASSWORD` supplied securely. Normal domain management then uses the authenticated `/superadmin` page.

## Hotel onboarding

Hotel codes are validated as URL slugs. Platform registration can derive a unique code from the hotel name. Self registration uses the chosen slug if available. That code becomes `<code>.hideout24.com` without creating a per-hotel Render domain entry. It starts serving the hotel when online booking is enabled and the one-time wildcard setup is live.

In `/superadmin`, open a hotel's website dialog. Add one hotel-owned domain. The backend reserves the hostname and adds it to Render. The owner configures DNS at their provider. Keep **Go live automatically when ready** off to use **Check status** and **Go live** manually. Turn it on to let the backend check every five minutes and activate the domain after Render verification, public DNS, and HTTPS pass. Pausing a live domain also turns automatic activation off. A failed custom-domain setup does not affect the HideOut24 subdomain.

Domain additions are limited to one per hotel and the configured Render allowance. Only authenticated platform administrators can change domain mappings. Render credentials are never returned to the browser.
