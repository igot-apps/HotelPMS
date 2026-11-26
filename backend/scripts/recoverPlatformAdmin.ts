// EMERGENCY Super Admin recovery. Run only from a trusted shell with production database access
// (for example the Render service Shell). It never prints or accepts a password: it reactivates the
// account, signs out every existing session and prints a one-time 30-minute password-reset link.
//
//   npm run platform-admin:recover -- --account <email or 10-digit phone> --confirm
//   npm run platform-admin:recover -- --account <phone> --set-email <email> --confirm   (attach an email)
//   npm run platform-admin:recover -- --account <email> --create --name "Full Name" --confirm   (no admin left)
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '../src/shared/utils/password';
import { platformLink } from '../src/shared/utils/platformEmail';

const prisma = new PrismaClient();
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function main() {
  const account = arg('account')?.trim().toLowerCase();
  const setEmail = arg('set-email')?.trim().toLowerCase();
  if (!account) throw new Error('Pass --account <email or 10-digit phone>.');
  if (!flag('confirm')) throw new Error('This signs out the account everywhere and issues a reset link. Re-run with --confirm.');
  if (setEmail && !EMAIL_RE.test(setEmail)) throw new Error('--set-email must be a valid email address.');

  const where = account.includes('@') ? { email: account } : { phone: account.replace(/\D/g, '') };
  let user = await prisma.user.findFirst({ where: { ...where, isPlatformAdmin: true, propertyId: null } });
  if (!user && await prisma.user.findFirst({ where })) throw new Error('That email/phone belongs to a hotel or guest-facing account, not a platform administrator.');

  if (!user) {
    if (!flag('create') || !account.includes('@')) throw new Error('No platform administrator found. To create one, pass an email as --account with --create --name "Full Name".');
    const fullName = arg('name')?.trim();
    if (!fullName) throw new Error('Pass --name "Full Name" with --create.');
    const role = await prisma.role.upsert({ where: { roleName: 'Platform Admin' }, update: {}, create: { roleName: 'Platform Admin', description: 'Platform-level property administration', isSystem: true } });
    user = await prisma.user.create({ data: {
      propertyId: null, fullName, email: account, username: `platform_admin_${randomBytes(8).toString('hex')}`,
      passwordHash: await hashPassword(randomBytes(32).toString('hex')), roleId: role.roleId, isPlatformAdmin: true, isActive: true,
    } });
  }

  if (setEmail && setEmail !== user.email) {
    const taken = await prisma.user.findUnique({ where: { email: setEmail } });
    if (taken) throw new Error('That email is already used by another account.');
  }
  const token = randomBytes(32).toString('hex');
  await prisma.user.update({ where: { userId: user.userId }, data: {
    isActive: true, invitationPending: false, invitationTokenHash: null, invitationExpiresAt: null,
    passwordResetTokenHash: createHash('sha256').update(token).digest('hex'),
    passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000),
    sessionVersion: randomBytes(16).toString('hex'),
    ...(setEmail ? { email: setEmail } : {}),
  } });
  await prisma.auditLog.create({ data: { userId: null, propertyId: null, entityType: 'PlatformAdmin', entityId: user.userId, action: 'PlatformAdminEmergencyRecovery', newData: { via: 'server-script', emailSet: Boolean(setEmail), created: flag('create') } } });

  console.log(`Recovered platform administrator #${user.userId}. All existing sessions were signed out.`);
  console.log('One-time reset link (valid 30 minutes, do not share or paste into chat/tickets):');
  console.log(platformLink('reset-password', token));
}

main()
  .catch((error) => { console.error(error.message || 'Recovery failed.'); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
