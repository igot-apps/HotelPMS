import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/utils/prisma';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';
import { guestResponse } from './public-auth.routes';

type Guest = { guestId: number; fullName: string; phone: string; email: string | null; centralPasswordHash: string | null };
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

// Local display format (0XXXXXXXXX) for a stored Ghana number.
const localPhone = (phone: string) => {
  const normalized = normalizeGhanaPhoneNumber(phone);
  return normalized ? `0${normalized.slice(4)}` : phone;
};
const phoneVariants = (phone: string) => [phone, `0${phone.slice(4)}`, phone.slice(1)];

export function guestProfile(guest: Guest) {
  return { fullName: guest.fullName, phone: localPhone(guest.phone), email: guest.email };
}

export async function updateGuestProfile(guest: Guest, input: { fullName?: unknown; phone?: unknown }) {
  const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 200 || fullName.toLowerCase() === 'guest') throw fail('Enter your full name.');
  const phone = normalizeGhanaPhoneNumber(input.phone);
  if (!phone) throw fail('Enter a valid Ghana mobile number.');
  const phoneChanged = normalizeGhanaPhoneNumber(guest.phone) !== phone;
  if (phoneChanged) {
    const taken = await prisma.platformGuest.findFirst({ where: { phone: { in: phoneVariants(phone) }, guestId: { not: guest.guestId } }, select: { guestId: true } });
    if (taken) throw fail('This number is already linked to another guest account.', 409);
  }
  const updated = await prisma.platformGuest.update({
    where: { guestId: guest.guestId },
    data: { fullName, ...(phoneChanged ? { phone, isPhoneVerified: false } : {}) },
  });
  return guestProfile(updated);
}

export async function changeGuestPassword(guest: Guest, propertyId: number | null, input: { currentPassword?: unknown; newPassword?: unknown }) {
  const { currentPassword, newPassword } = input;
  if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword) > 72) throw fail('Enter your current password.');
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 15) throw fail('Use a new password between 6 and 15 characters.');
  if (newPassword === currentPassword) throw fail('Choose a password different from your current one.');
  const email = guest.email?.trim().toLowerCase();
  if (!email) throw fail('This account has no email sign-in.', 409);

  if (propertyId) {
    const account = await prisma.hotelGuestAccount.findUnique({ where: { propertyId_email: { propertyId, email } } });
    if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) throw fail('Your current password is incorrect.');
    const updated = await prisma.hotelGuestAccount.update({
      where: { propertyId_email: { propertyId, email } },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), sessionVersion: { increment: 1 } },
      include: { platformGuest: true },
    });
    return guestResponse(updated.platformGuest, updated);
  }

  if (!guest.centralPasswordHash || !(await bcrypt.compare(currentPassword, guest.centralPasswordHash))) throw fail('Your current password is incorrect.');
  const updated = await prisma.platformGuest.update({
    where: { guestId: guest.guestId },
    data: { centralPasswordHash: await bcrypt.hash(newPassword, 12) },
  });
  return guestResponse(updated);
}
