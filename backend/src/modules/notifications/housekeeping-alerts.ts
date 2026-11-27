import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';
import { notifyStaff, pushConfigured, wantsAlert } from './push.service';

export { wantsAlert };

/**
 * Push alerts for housekeepers. Each person can switch any of these off on My profile;
 * the Housekeeping screen always shows the work regardless.
 */
export const HOUSEKEEPING_ALERTS = [
  { key: 'roomNeedsCleaning', label: 'Room needs cleaning', description: 'When a guest actually checks out.' },
  { key: 'urgentCleaning', label: 'Urgent cleaning required', description: 'When a room that needs cleaning has a guest arriving today.' },
  { key: 'checkoutSummary', label: 'Upcoming checkouts', description: 'A morning summary of expected departures.' },
  { key: 'checkinSummary', label: 'Upcoming check-ins', description: 'A morning summary of expected arrivals.' },
  { key: 'maintenanceResolved', label: 'Maintenance resolved', description: 'When a room comes back from maintenance.' },
] as const;
export type HousekeepingAlert = typeof HOUSEKEEPING_ALERTS[number]['key'];
export const isHousekeepingAlert = (key: unknown): key is HousekeepingAlert => HOUSEKEEPING_ALERTS.some(alert => alert.key === key);


/** Morning alerts wait until this hour (hotel time) so nobody is woken at night. */
export const MORNING_HOUR = 7;
const ACTIVE = ['Confirmed', 'InHouse'] as any[];
const DAY = 86_400_000;

const clock = (time?: string | null) => {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const hotelHour = (now: Date, timeZone: string) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
const dayStart = (date: string) => new Date(`${date}T00:00:00Z`);

/** Rooms (of these) that have a guest due in today or already late. */
async function roomsWithArrivalToday(roomIds: number[], today: string) {
  if (!roomIds.length) return new Set<number>();
  const stays = await prisma.reservationRoom.findMany({
    where: { roomId: { in: roomIds }, status: 'Reserved', checkInDate: { lt: new Date(dayStart(today).getTime() + DAY) }, checkOutDate: { gt: dayStart(today) }, reservation: { status: { in: ACTIVE } } },
    select: { roomId: true },
  });
  return new Set(stays.map(stay => stay.roomId as number));
}

async function sendUrgent(room: { roomId: number; roomNumber: string; propertyId: number }, today: string, checkInTime?: string | null) {
  return notifyStaff(room.propertyId, ['Housekeeper'], {
    title: 'Urgent cleaning', body: `Room ${room.roomNumber} needs cleaning. A guest arrives today${checkInTime ? ` from ${clock(checkInTime)}` : ''}.`,
    url: '/housekeeping', tag: `clean-${room.roomId}`,
  }, { alert: 'urgentCleaning', onceKey: `urgent-clean:${room.roomId}:${today}` });
}

/** After a checkout commits: tell housekeepers the room needs cleaning (urgent when a guest arrives today). */
export async function notifyRoomsNeedCleaning(roomIds: number[], now = new Date()) {
  try {
    if (!pushConfigured() || !roomIds.length) return;
    const rooms = await prisma.room.findMany({
      where: { roomId: { in: roomIds }, operationalStatus: 'Available', housekeepingStatus: 'Dirty', property: { housekeepingEnabled: true } },
      select: { roomId: true, roomNumber: true, propertyId: true, property: { select: { timezone: true, checkInTime: true } } },
    });
    for (const room of rooms) {
      const today = hotelDate(now, room.property.timezone || 'Africa/Accra');
      if ((await roomsWithArrivalToday([room.roomId], today)).has(room.roomId)) {
        await sendUrgent(room, today, room.property.checkInTime);
      } else {
        await notifyStaff(room.propertyId, ['Housekeeper'], {
          title: 'Room needs cleaning', body: `Room ${room.roomNumber}: the guest has checked out.`, url: '/housekeeping', tag: `clean-${room.roomId}`,
        }, { alert: 'roomNeedsCleaning' });
      }
    }
  } catch (error) {
    console.warn('Could not send cleaning notifications', error instanceof Error ? error.message : error);
  }
}

/** A room left maintenance and is available again. */
export async function notifyMaintenanceResolved(roomId: number) {
  try {
    if (!pushConfigured()) return;
    const room = await prisma.room.findFirst({ where: { roomId, operationalStatus: 'Available', property: { housekeepingEnabled: true } }, select: { roomId: true, roomNumber: true, propertyId: true, housekeepingStatus: true } });
    if (!room) return;
    await notifyStaff(room.propertyId, ['Housekeeper'], {
      title: 'Maintenance resolved',
      body: room.housekeepingStatus === 'Dirty' ? `Room ${room.roomNumber} is back in service and needs cleaning.` : `Room ${room.roomNumber} is back in service. Check it is ready for guests.`,
      url: '/housekeeping', tag: `clean-${room.roomId}`,
    }, { alert: 'maintenanceResolved' });
  } catch (error) {
    console.warn('Could not send maintenance notification', error instanceof Error ? error.message : error);
  }
}

let checking = false;
/**
 * Every few minutes, from the morning hour: rooms that still need cleaning with a guest arriving today
 * (once per room per day), and one morning summary of expected checkouts and check-ins (once per day).
 */
export async function runHousekeepingAlerts(now = new Date()) {
  if (!pushConfigured() || checking) return;
  checking = true;
  try {
    const properties = await prisma.property.findMany({
      where: { isActive: true, status: 'Active', housekeepingEnabled: true, OR: [
        { users: { some: { role: { roleName: 'Housekeeper' }, pushSubscriptions: { some: {} } } } },
        { memberships: { some: { isActive: true, user: { role: { roleName: 'Housekeeper' }, pushSubscriptions: { some: {} } } } } },
      ] },
      select: { propertyId: true, timezone: true, checkInTime: true, checkOutTime: true },
    });
    for (const property of properties) {
      const timeZone = property.timezone || 'Africa/Accra';
      if (hotelHour(now, timeZone) < MORNING_HOUR) continue;
      const today = hotelDate(now, timeZone);
      const start = dayStart(today);
      const end = new Date(start.getTime() + DAY);

      const dirty = await prisma.room.findMany({ where: { propertyId: property.propertyId, operationalStatus: 'Available', housekeepingStatus: 'Dirty' }, select: { roomId: true, roomNumber: true, propertyId: true } });
      const arriving = await roomsWithArrivalToday(dirty.map(room => room.roomId), today);
      for (const room of dirty) if (arriving.has(room.roomId)) await sendUrgent(room, today, property.checkInTime);

      const [checkouts, checkins] = await Promise.all([
        prisma.reservationRoom.count({ where: { status: 'CheckedIn', checkOutDate: { lt: end }, reservation: { propertyId: property.propertyId, status: { in: ACTIVE } } } }),
        prisma.reservationRoom.count({ where: { status: 'Reserved', checkInDate: { lt: end }, checkOutDate: { gt: start }, reservation: { propertyId: property.propertyId, status: { in: ACTIVE } } } }),
      ]);
      if (checkouts) await notifyStaff(property.propertyId, ['Housekeeper'], {
        title: 'Checkouts today', body: `${checkouts} ${checkouts === 1 ? 'room is' : 'rooms are'} expected to check out today${property.checkOutTime ? ` by ${clock(property.checkOutTime)}` : ''}.`,
        url: '/housekeeping?view=schedule&range=today', tag: `checkouts-${today}`,
      }, { alert: 'checkoutSummary', onceKey: `hk-checkouts:${property.propertyId}:${today}` });
      if (checkins) await notifyStaff(property.propertyId, ['Housekeeper'], {
        title: 'Check-ins today', body: `${checkins} ${checkins === 1 ? 'guest is' : 'guests are'} expected to arrive today${property.checkInTime ? ` from ${clock(property.checkInTime)}` : ''}.`,
        url: '/housekeeping?view=schedule&range=today', tag: `checkins-${today}`,
      }, { alert: 'checkinSummary', onceKey: `hk-checkins:${property.propertyId}:${today}` });
    }
  } catch (error) {
    console.warn('Could not check housekeeping notifications', error instanceof Error ? error.message : error);
  } finally {
    checking = false;
  }
}

/** Preferences for the signed-in person: the list of alerts for their role with on/off. */
export async function getAlertPreferences(userId: number) {
  const user = await prisma.user.findUnique({ where: { userId }, select: { notificationPreferences: true, role: { select: { roleName: true } } } });
  if (user?.role.roleName !== 'Housekeeper') return [];
  return HOUSEKEEPING_ALERTS.map(alert => ({ ...alert, enabled: wantsAlert(user.notificationPreferences, alert.key) }));
}

export async function setAlertPreference(userId: number, key: unknown, enabled: unknown) {
  if (!isHousekeepingAlert(key) || typeof enabled !== 'boolean') throw Object.assign(new Error('Choose a valid notification and on or off.'), { statusCode: 400 });
  const user = await prisma.user.findUnique({ where: { userId }, select: { notificationPreferences: true, role: { select: { roleName: true } } } });
  if (user?.role.roleName !== 'Housekeeper') throw Object.assign(new Error('There are no notification choices for your role yet.'), { statusCode: 403 });
  const current = user.notificationPreferences && typeof user.notificationPreferences === 'object' ? user.notificationPreferences as Record<string, unknown> : {};
  const next: Record<string, boolean> = {};
  for (const alert of HOUSEKEEPING_ALERTS) if (current[alert.key] === false) next[alert.key] = false;
  if (enabled) delete next[key]; else next[key] = false;
  await prisma.user.update({ where: { userId }, data: { notificationPreferences: next } });
  return getAlertPreferences(userId);
}
