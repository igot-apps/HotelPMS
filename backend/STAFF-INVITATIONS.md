Staff invitations
=================

Managers use Staff Management > Invite Receptionist. New accounts remain inactive
until the receptionist sets a password using the invitation link. Invitations last
24 hours; resending invalidates the previous link. Disabling a pending account
cancels its invitation. Managers cannot set or retrieve staff passwords.

Email currently uses the simulation adapter in src/shared/utils/staffEmail.ts.
The manager sees an email preview with a copyable setup link; no email is sent.
Set FRONTEND_URL to the browser-facing frontend origin. For production testing,
explicitly set STAFF_EMAIL_MODE=simulation; otherwise production invitations fail
until a delivery provider is configured. Simulation grants the manager access to
the setup link, so use it only for testing with trusted managers.

To connect a provider, implement delivery inside deliverStaffInvitation, send the
setup URL to the recipient, and return delivery status without the setup URL.
The invitation lifecycle and password setup page can remain unchanged. Update
the manager UI to show delivery status instead of the simulation preview.

Apply migrations with npx prisma migrate deploy, then npx prisma generate.
Managers gain the staff management permission on their next login.
Local lifecycle verification: npx ts-node --transpile-only scripts/verifyStaffInvitations.ts
