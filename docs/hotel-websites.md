# Hotel websites: pilot setup

The existing hotel page and booking paths are reused. A hotel's included address is its property code in lowercase followed by `.hideout24.com`. For example, property code `OB-hotel` becomes `ob-hotel.hideout24.com` when online booking is enabled. A hotel-owned domain is registered separately in Platform administration → All properties → globe icon.

## Pilot at `demo.hideout24.com`

1. Deploy the database migration, API, and frontend together. Do not point a domain to the frontend until the API can resolve it.
2. In Render, add `demo.hideout24.com` to the **hotelpms-frontend** static site's Custom Domains section.
3. In the DNS zone for `hideout24.com`, add a `demo` CNAME pointing to `hotelpms-frontend.onrender.com`. Leave Resend's existing DKIM, SPF, and other email records intact.
4. In the HideOut24 platform administrator's All properties page, click the globe icon for the pilot hotel. Add `demo.hideout24.com`.
5. Once Render reports the domain verified and HTTPS works, click **Activate**. The domain will then open the existing hotel page for that property. Check room selection, guest sign-in, booking, Paystack return, and My Reservations.

## A hotel-owned domain

1. The hotel retains ownership of its domain. Add the exact hostname to its website addresses in Platform administration. It starts inactive.
2. Add the hostname to the same Render frontend service. The hotel's DNS administrator follows Render's custom-domain instructions. A `www` subdomain uses a CNAME to `hotelpms-frontend.onrender.com`; an apex/root domain needs the root-domain record Render specifies. Render may also add a corresponding root or `www` redirect.
3. When Render verifies DNS and issues HTTPS, open the domain and check that the correct hotel appears. Activate it in HideOut24. Keep it inactive until those checks pass.
4. If the hotel changes or cancels the domain, pause or remove the mapping in HideOut24 and remove the domain from Render. Existing hotel records remain tied to the property ID.

## Included hotel subdomains

The API can resolve valid `<property-code>.hideout24.com` hostnames automatically, so each hotel does not need a database domain row. The DNS and Render hosting layer still needs to accept those hostnames. Render's wildcard-domain instructions currently require the root `hideout24.com` to point to Render too. If that is not configured, an individual subdomain can be added to Render and DNS for a small pilot, but a subdomain is not publicly reachable just because HideOut24 displays it.

The root domain can serve the existing HideOut24 marketplace. Changing its web DNS records does not require removing separate Resend email records. Verify the existing DNS zone before making changes.

The platform admin's **Activate** action records a manual verification decision. It does not call Render or automatically inspect DNS or TLS. The Render plugin currently has no custom-domain management action, so Render/DNS setup is manual for this pilot.
