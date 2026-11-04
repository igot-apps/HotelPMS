import { prisma } from '../../shared/utils/prisma';

export function hotelDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dayBounds(date: string, timeZone: string) {
  const base = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid report date.');
  const midnight = (target: Date) => {
    let result = target.getTime();
    for (let i = 0; i < 4; i++) {
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(result));
      const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
      result += target.getTime() - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    }
    return new Date(result);
  };
  return { gte: midnight(base), lt: midnight(new Date(base.getTime() + 86400000)) };
}

export async function dailyOverview(userId: number, propertyId: number, requestedDate?: string) {
  const user = await prisma.user.findFirst({ where: { userId, propertyId, isActive: true }, include: { role: true, property: true } });
  if (!user || user.role.roleName !== 'Manager' || !user.property) throw Object.assign(new Error('Only the hotel manager can view the daily overview.'), { statusCode: 403 });
  const timeZone = user.property.timezone || 'Africa/Accra';
  const date = requestedDate || hotelDate(new Date(), timeZone);
  const bounds = dayBounds(date, timeZone);
  return prisma.$transaction(async tx => {
    const [payments, events, bookingsCreated, checkIns, checkOuts, cancellations, unpaid, refunds] = await Promise.all([
      tx.payment.findMany({
        where: { reservation: { propertyId }, paymentDate: bounds },
        orderBy: [{ paymentDate: 'desc' }, { paymentId: 'desc' }],
        include: {
          receiver: { select: { userId: true, fullName: true } },
          reservation: { select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true, propertyGuest: { select: { fullName: true } }, platformGuest: { select: { fullName: true } } } },
        },
      }),
      tx.auditLog.findMany({ where: { user: { propertyId }, entityType: 'Reservation', createdAt: bounds }, orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } } }),
      tx.reservation.count({ where: { propertyId, createdAt: bounds } }),
      tx.reservationRoom.count({ where: { reservation: { propertyId }, actualCheckIn: bounds } }),
      tx.reservationRoom.count({ where: { reservation: { propertyId }, actualCheckOut: bounds } }),
      tx.reservation.count({ where: { propertyId, cancellationDate: bounds } }),
      tx.reservation.findMany({ where: { propertyId, status: { in: ['Confirmed', 'InHouse', 'Completed'] } }, select: { totalAmount: true, amountPaid: true } }),
      tx.refund.findMany({ where: { propertyId, isSimulated: false, returnedAt: bounds }, orderBy: { returnedAt: 'desc' }, include: { reservation: { select: { confirmationCode: true } } } }),
    ]);
    const staff = new Map<string, any>();
    const methods = new Map<string, number>();
    let totalCents = 0, correctionCents = 0, transactions = 0;
    const transactionsList = payments.map(p => {
      const online = Boolean(p.gatewayReference?.startsWith('RES-'));
      const correction = Boolean(p.notes?.startsWith('Correction of payment #'));
      const cents = Math.round(Number(p.amount) * 100);
      const recordedBy = online ? 'Online / Paystack' : p.receiver?.fullName || 'Unknown / former staff';
      const key = online ? 'online' : p.receivedBy ? `staff:${p.receivedBy}` : 'unknown';
      if (p.status === 'Completed' && !correction) {
        const row = staff.get(key) || { key, name: recordedBy, count: 0, total: 0, methods: {} };
        row.count++; row.total += cents; row.methods[p.paymentMethod] = (row.methods[p.paymentMethod] || 0) + cents; staff.set(key, row);
        methods.set(p.paymentMethod, (methods.get(p.paymentMethod) || 0) + cents); totalCents += cents; transactions++;
      }
      if (p.status === 'Completed' && correction) correctionCents += cents;
      return { paymentId: p.paymentId, reservationId: p.reservationId, confirmationCode: p.reservation.confirmationCode, guest: p.reservation.guestNameSnapshot || p.reservation.propertyGuest?.fullName || p.reservation.platformGuest?.fullName || 'Guest', amount: Number(p.amount), method: p.paymentMethod, status: p.status, time: p.paymentDate, recordedBy, staffKey: key, correction };
    });
    const refundsReturned = refunds.reduce((sum, refund) => sum + Math.round(Number(refund.amount) * 100), 0) / 100;
    return { date, timeZone, generatedAt: new Date(), collections: totalCents / 100, transactions, correctionEntries: correctionCents / 100, refundsReturned, netCollections: (totalCents + correctionCents) / 100 - refundsReturned, refunds,
      byStaff: [...staff.values()].map(row => ({ ...row, total: row.total / 100, methods: Object.fromEntries(Object.entries(row.methods).map(([k, v]) => [k, Number(v) / 100])) })).sort((a, b) => b.total - a.total),
      byMethod: [...methods].map(([method, cents]) => ({ method, total: cents / 100 })),
      activity: { bookingsCreated, checkIns, checkOuts, cancellations, outstandingNow: unpaid.reduce((sum, r) => sum + Math.max(0, Math.round((Number(r.totalAmount || 0) - Number(r.amountPaid)) * 100)), 0) / 100 },
      payments: transactionsList,
      events: events.map(e => ({ id: e.auditLogId, action: e.action, actor: e.user?.fullName || 'Former staff', time: e.createdAt, reservationId: (e.newData as any)?.reservationId, reason: (e.newData as any)?.reason })),
    };
  }, { isolationLevel: 'RepeatableRead' });
}
