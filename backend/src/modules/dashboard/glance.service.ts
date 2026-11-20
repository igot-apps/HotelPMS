import { prisma } from '../../shared/utils/prisma';
import { getSubscriptionState, subscriptionFields } from '../payment/subscription-state';
import { dayBounds, hotelDate } from '../reports/daily-overview.service';
import { checkoutDueAt, minutesLate, noShowAllowedFrom } from '../reservation/stay-timing';

const DAY = 86_400_000;
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const ACTIVE = ['Confirmed', 'InHouse'] as any[];
const nights = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));
const guestName = (stay: any) => stay.occupantName || stay.reservation.guestNameSnapshot || stay.reservation.platformGuest?.fullName || stay.reservation.propertyGuest?.fullName || 'Guest';
const balanceOf = (res: any) => Math.max(0, money(Number(res.totalAmount || 0) - Number(res.amountPaid)));

// The front desk's key questions for today, each with the rows behind the number.
export async function getDashboardGlance(propertyId: number, role: string, now = new Date()) {
  const property = await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true, checkOutTime: true, checkInTime: true, isOnlineBookingEnabled: true, isActive: true, status: true, ...subscriptionFields } });
  if (!property) throw new Error('Hotel not found.');
  const timeZone = property.timezone || 'Africa/Accra';
  const date = hotelDate(now, timeZone);
  const today = new Date(`${date}T00:00:00.000Z`);
  const tomorrow = new Date(today.getTime() + DAY);
  const weekAhead = new Date(today.getTime() + 8 * DAY); // arrivals expected tomorrow up to 7 days ahead
  const { gte: start, lt: end } = dayBounds(date, timeZone);
  const reservationInclude = { reservation: { select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true, guestPhoneSnapshot: true, totalAmount: true, amountPaid: true, source: true, platformGuest: { select: { fullName: true } }, propertyGuest: { select: { fullName: true } } } }, room: { select: { roomNumber: true } } };

  const [stays, rooms, payments, approvalsPending, refundsPending] = await Promise.all([
    prisma.reservationRoom.findMany({
      where: { reservation: { propertyId, status: { in: ACTIVE } }, OR: [
        { status: 'CheckedIn' },
        { status: 'Reserved', checkInDate: { lt: weekAhead } }, // today, overdue and the next 7 days
        { status: 'CheckedOut', actualCheckOut: { gte: start, lt: end } },
        { status: 'CheckedIn', actualCheckIn: { gte: start, lt: end } },
      ] },
      include: reservationInclude, orderBy: [{ checkOutDate: 'asc' }, { reservationRoomId: 'asc' }],
    }),
    prisma.room.findMany({ where: { propertyId, roomType: { isActive: true } }, include: { roomType: { select: { typeName: true } }, reservationRooms: {
      where: { status: { in: ['Reserved', 'CheckedIn'] }, reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } }, OR: [{ checkInDate: { lt: tomorrow }, checkOutDate: { gt: today } }, { status: 'CheckedIn' }] },
      select: { reservationRoomId: true },
    } }, orderBy: { roomNumber: 'asc' } }),
    prisma.payment.findMany({ where: { reservation: { propertyId }, status: 'Completed', paymentDate: { gte: start, lt: end } }, include: { reservation: { select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true } }, receiver: { select: { fullName: true } } }, orderBy: { paymentDate: 'desc' } }),
    role === 'Manager' ? prisma.correctionRequest.count({ where: { propertyId, status: 'Pending' } }) : Promise.resolve(0),
    prisma.correctionRequest.count({ where: { propertyId, action: 'refund', status: { in: ['Pending', 'Approved'] } } }),
  ]);

  const row = (stay: any) => ({
    reservationRoomId: stay.reservationRoomId, reservationId: stay.reservation.reservationId, confirmationCode: stay.reservation.confirmationCode,
    roomNumber: stay.room?.roomNumber || stay.roomNumberSnapshot || null, guestName: guestName(stay),
    phone: stay.reservation.guestPhoneSnapshot || null,
    checkInDate: stay.checkInDate, checkOutDate: stay.checkOutDate, actualCheckIn: stay.actualCheckIn, actualCheckOut: stay.actualCheckOut,
    guestPresenceStatus: stay.guestPresenceStatus, guestOutAt: stay.guestOutAt, guestReturnedAt: stay.guestReturnedAt,
    nightsBooked: nights(stay.checkInDate, stay.checkOutDate), balanceDue: balanceOf(stay.reservation), source: stay.reservation.source,
  });

  const inHouse = stays.filter(s => s.status === 'CheckedIn').map(stay => {
    const dueAt = checkoutDueAt(stay.checkOutDate, property.checkOutTime, timeZone);
    return { ...row(stay), nightsUsed: Math.min(nights(stay.checkInDate, today), nights(stay.checkInDate, stay.checkOutDate)), expectedCheckoutAt: dueAt, minutesLate: minutesLate(dueAt, now) };
  });
  const arrivalsWaiting = stays.filter(s => s.status === 'Reserved' && s.checkInDate < tomorrow).map(stay => {
    // Past the no-show cut-off (arrival day after check-in time + grace, or a later day): likely a no-show.
    const noShowFrom = noShowAllowedFrom(stay.checkInDate, property.checkInTime, timeZone);
    return { ...row(stay), late: stay.checkInDate < today, missed: now >= noShowFrom, noShowFrom, amountPaid: money(stay.reservation.amountPaid), daysMissed: nights(stay.checkInDate, today), nightsLeft: nights(stay.checkInDate < today ? today : stay.checkInDate, stay.checkOutDate) };
  });
  const missedArrivals = arrivalsWaiting.filter(stay => stay.missed);
  // Expected over the next 7 days (not today), soonest first.
  const upcoming = stays.filter(s => s.status === 'Reserved' && s.checkInDate >= tomorrow).map(row).sort((a, b) => +new Date(a.checkInDate) - +new Date(b.checkInDate));
  const expectedArrivals = arrivalsWaiting.filter(stay => !stay.missed);
  const arrivedToday = stays.filter(s => s.status === 'CheckedIn' && s.actualCheckIn && s.actualCheckIn >= start && s.actualCheckIn < end).map(row);
  const departuresWaiting = inHouse.filter(stay => new Date(stay.checkOutDate) <= today);
  const departedToday = stays.filter(s => s.status === 'CheckedOut').map(row);

  const sellable = rooms.filter(room => room.operationalStatus !== 'Maintenance');
  // Why guests might not be able to book online (setup problems, not a busy night).
  const onlineBlocker = (!property.isActive || property.status !== 'Active') ? 'deactivated'
    : getSubscriptionState(property, now).expired ? 'subscription-expired'
    : !property.isOnlineBookingEnabled ? 'online-off'
    : !rooms.length ? 'no-rooms'
    : !sellable.length ? 'all-maintenance'
    : !sellable.some(room => room.isOnlineBookable) ? 'all-hidden'
    : null;
  const freeTonight = sellable.filter(room => !room.reservationRooms.length).map(room => ({ roomId: room.roomId, roomNumber: room.roomNumber, roomType: room.roomType.typeName, housekeepingStatus: room.housekeepingStatus, isOnlineBookable: room.isOnlineBookable }));
  const occupiedTonight = sellable.length - freeTonight.length;

  const unpaid = new Map<string, any>();
  for (const stay of inHouse) if (stay.balanceDue > 0 && !unpaid.has(stay.reservationId)) unpaid.set(stay.reservationId, stay);

  return {
    date, timeZone, generatedAt: now, checkOutTime: property.checkOutTime || '11:00',
    arrivals: { waiting: expectedArrivals, missed: missedArrivals, arrivedToday, upcoming, unpaidCount: expectedArrivals.filter(stay => stay.balanceDue > 0).length },
    departures: { waiting: departuresWaiting, departedToday },
    inHouse,
    onlineBlocker,
    rooms: {
      total: sellable.length, roomsSetUp: rooms.length, fullyBookedTonight: sellable.length > 0 && freeTonight.length === 0, occupiedTonight, freeTonight,
      occupancyPercent: sellable.length ? Math.round((occupiedTonight / sellable.length) * 100) : 0,
      needsCleaning: rooms.filter(r => r.housekeepingStatus === 'Dirty').map(r => ({ roomId: r.roomId, roomNumber: r.roomNumber, roomType: r.roomType.typeName, operationalStatus: r.operationalStatus })),
      maintenance: rooms.filter(r => r.operationalStatus === 'Maintenance').map(r => ({ roomId: r.roomId, roomNumber: r.roomNumber, roomType: r.roomType.typeName, maintenanceReason: r.maintenanceReason })),
    },
    money: {
      // Hotel-wide collections are for the manager only; receptionists see their own takings ("You today").
      collectedToday: role === 'Manager' ? money(payments.reduce((sum, p) => sum + Number(p.amount), 0)) : null,
      collectedAtDesk: role === 'Manager' ? money(payments.filter(p => !p.verifiedProvider).reduce((sum, p) => sum + Number(p.amount), 0)) : null,
      collectedOnline: role === 'Manager' ? money(payments.filter(p => p.verifiedProvider).reduce((sum, p) => sum + Number(p.amount), 0)) : null,
      payments: role !== 'Manager' ? [] : payments.map(p => ({ paymentId: p.paymentId, amount: money(p.amount), method: p.paymentMethod, at: p.paymentDate, receivedBy: p.receiver?.fullName || (p.verifiedProvider ? 'Online' : null), reservationId: p.reservation.reservationId, confirmationCode: p.reservation.confirmationCode, guestName: p.reservation.guestNameSnapshot || 'Guest' })),
      inHouseOutstanding: money([...unpaid.values()].reduce((sum, stay) => sum + stay.balanceDue, 0)),
      unpaidInHouse: [...unpaid.values()],
      refundsPending,
    },
    approvalsPending,
  };
}
