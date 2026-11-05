Staff invitations
=================

Managers use Staff Management > Invite Receptionist. New accounts remain inactive
until the receptionist sets a password using the invitation link. Invitations last
24 hours; resending invalidates the previous link. Disabling a pending account
cancels its invitation. Managers cannot set or retrieve staff passwords.

Staff invitation email uses Resend's official Node SDK. Set these environment
variables on the backend service (including Render's Environment page):

  RESEND_API_KEY       A Resend sending-only API key
  RESEND_FROM_EMAIL   Example: HideOut24 <staff@mail.yourdomain.com>
  FRONTEND_URL        The browser-facing app origin

Verify the sender domain in Resend before sending to receptionists. A Resend
account without a verified domain can use onboarding@resend.dev only for test
messages to the account owner; it cannot deliver invitations to arbitrary staff.
Production rejects this test sender. Never put the API key in Git or the frontend.

For local testing without delivery, explicitly set STAFF_EMAIL_MODE=simulation.
The manager then sees a copyable setup link. Do not enable simulation in a live
hotel; it grants the manager access to the receptionist's setup link. With Resend
configured, the manager sees a delivery confirmation without the secret link.
If delivery fails, the pending account remains and the manager can use Resend
invite after fixing the sender configuration. A successful Resend API response
means Resend accepted the email, not that the recipient has opened it.

Apply migrations with npx prisma migrate deploy, then npx prisma generate.
Managers gain the staff management permission on their next login.
Local lifecycle verification: npx ts-node --transpile-only scripts/verifyStaffInvitations.ts
