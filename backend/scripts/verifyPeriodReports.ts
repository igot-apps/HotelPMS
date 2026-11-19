// End-to-end check of period reporting (manager dashboard), against the LOCAL database only.
// Creates a throwaway fixture hotel with money on three days, then deletes it. Optionally writes the
// period Daily overview to a file (first argument) for the dashboard grouping test.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { requestRefund } from '../src/modules/reservation/refund.service';
import { getFullDashboardReport } from '../src/modules/reports/report.service';
import { dailyOverview, hotelDate } from '../src/modules/reports/daily-overview.service';
import { cashReconciliationRange, recordCashCount } from '../src/modules/reports/cash-reconciliation.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'per-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Period fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', isNonRefundable: true } });
  let userIds: number[] = [];
  try {
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const mk = (s: string, name: string, roleId: number) => prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-${s}`, fullName: name, roleId, passwordHash: 'no-login' } });
    const [m, ama, kofi] = await Promise.all([mk('m', 'Manager Mensah', managerRole.roleId), mk('a', 'Ama Desk', receptionRole.roleId), mk('k', 'Kofi Desk', receptionRole.roleId)]);
    userIds = [m.userId, ama.userId, kofi.userId];
    const M = { userId: m.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '701' } });
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const at = (offset: number, hour: number) => new Date(`${day(offset)}T${String(hour).padStart(2, '0')}:00:00Z`); // Accra = UTC
    const now = new Date();
    const todayAt = (hour: number) => (at(0, hour) < now ? at(0, hour) : new Date(now.getTime() - 60000));
    const booking = async (suffix: string, total: number, payments: { amount: number; when: Date; by: number | null; online?: boolean }[]) => {
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      return prisma.reservation.create({ data: {
        propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: `Guest ${suffix}`, source: 'Walk-in', totalAmount: total, amountPaid: paid, status: 'Confirmed',
        checkInDate: at(10, 0), checkOutDate: at(11, 0),
        reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: at(10, 0), checkOutDate: at(11, 0), agreedPricePerNight: total, status: 'Reserved' } },
        payments: { create: payments.map(p => ({ propertyId: hotel.propertyId, amount: p.amount, paymentMethod: p.online ? 'Card' : 'Cash', paymentDate: p.when, receivedBy: p.by, ...(p.online ? { verifiedProvider: 'Paystack', verifiedAt: p.when, gatewayReference: `PSK-${suffix}-${code}` } : {}) })) },
      }, include: { payments: true } });
    };
    // Ama: cash 100 two days ago, 200 yesterday, 300 today. Online 500 today. Kofi: cash 80 two days ago.
    const a2 = await booking('A2', 100, [{ amount: 100, when: at(-2, 9), by: ama.userId }]);
    const a1 = await booking('A1', 150, [{ amount: 200, when: at(-1, 9), by: ama.userId }]); // GHS 50 overpaid → refundable
    await booking('A0', 300, [{ amount: 300, when: todayAt(8), by: ama.userId }]);
    await booking('O0', 500, [{ amount: 500, when: todayAt(8), by: null, online: true }]);
    const k2 = await booking('K2', 60, [{ amount: 80, when: at(-2, 10), by: kofi.userId }]); // GHS 20 overpaid
    void a2;
    const refund = async (userId: number, b: any, amount: number, returnedAt: Date) => {
      const actor = { userId, propertyId: hotel.propertyId };
      const p: any = await requestRefund(actor, b.reservationId, { paymentId: b.payments[0].paymentId, amount, reason: 'Overpaid.', mode: 'Manual', preview: true });
      return requestRefund(actor, b.reservationId, { paymentId: b.payments[0].paymentId, amount, reason: 'Overpaid.', mode: 'Manual', expectedVersion: p.version, recordDirectly: true, method: 'Cash', reference: null, moneyReturned: true, policyException: true, returnedAt: returnedAt.toISOString() });
    };
    await refund(ama.userId, a1, 50, at(-1, 12));   // returned yesterday, recorded now (late)
    await refund(kofi.userId, k2, 20, at(-2, 12));  // returned two days ago, recorded now (late)
    await recordCashCount(M, { staffUserId: ama.userId, date: day(-1), countedAmount: 140 }); // expected 200 − 50 = 150 → −10

    // 1. The range report now includes the last day (today's money was dropped before).
    const rep: any = await getFullDashboardReport(hotel.propertyId, day(-2), today);
    const todayBar = rep.timeSeries.find((d: any) => d.date === today);
    assert.equal(todayBar.total, 800);
    assert.equal(rep.timeSeries.length, 3);
    const todayOnly: any = await getFullDashboardReport(hotel.propertyId, today, today);
    assert.equal(todayOnly.timeSeries.length, 1);
    assert.equal(todayOnly.timeSeries[0].total, 800);
    console.log('1 ok: report range includes its last day (today GHS 800), days grouped by hotel day');

    // 2. Period totals: money by payment date, refunds by return date, nothing counted twice.
    const period: any = await dailyOverview(m.userId, hotel.propertyId, day(-2), today);
    assert.equal(period.collections, 1180);       // 100 + 200 + 300 + 500 + 80
    assert.equal(period.refundsReturned, 70);     // 50 + 20, both returned inside the period
    assert.equal(period.netCollections, 1110);
    assert.equal(period.refunds.length, 2);
    assert.equal(period.refundsRecordedLate.length, 0); // returned inside the period → not listed again
    const onlyToday: any = await dailyOverview(m.userId, hotel.propertyId, today);
    assert.equal(onlyToday.refundsReturned, 0);   // both were returned on earlier days
    assert.equal(onlyToday.refunds.length, 0);
    assert.equal(onlyToday.refundsRecordedLate.length, 2); // recorded today → visible, not counted
    console.log('2 ok: 3-day period GHS 1,180 collected − GHS 70 refunds = GHS 1,110; today alone counts no refunds but lists the 2 recorded today');
    if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ period, onlyToday, ids: { ama: ama.userId, kofi: kofi.userId } }));

    // 3. Multi-day cash: only counted days give a difference; uncounted days are listed, not shortages.
    const cashRange: any = await cashReconciliationRange(M, day(-2), today);
    const amaCash = cashRange.staff.find((r: any) => r.userId === ama.userId);
    assert.equal(amaCash.expectedCash, 550);      // 100 + (200 − 50) + 300
    assert.equal(amaCash.countedDays, 1);
    assert.equal(amaCash.differenceOnCountedDays, -10);
    assert.deepEqual(amaCash.uncountedDays, [day(-2), today]);
    const kofiCash = cashRange.staff.find((r: any) => r.userId === kofi.userId);
    assert.equal(kofiCash.expectedCash, 60);      // 80 − 20 refund
    assert.equal(kofiCash.countedDays, 0);
    assert.equal(cashRange.totals.differenceOnCountedDays, -10);
    assert.equal(cashRange.totals.uncountedPersonDays, 3);
    console.log('3 ok: Ama expected GHS 550 over 3 days, 1 day counted (−10), 2 days not counted; Kofi not counted — no false shortage');

    // 4. Limits.
    await assert.rejects(() => dailyOverview(m.userId, hotel.propertyId, day(-100), today), /at most 92 days/);
    await assert.rejects(() => dailyOverview(m.userId, hotel.propertyId, today, day(-1)), /on or after/);
    await assert.rejects(() => cashReconciliationRange({ userId: ama.userId, propertyId: hotel.propertyId }, day(-2), today), /Only the manager/);
    console.log('4 ok: periods over 92 days or backwards are refused; receptionists cannot view period cash');
    console.log('\nAll period report checks passed.');
  } finally {
    await prisma.cashCount.deleteMany({ where: { propertyId: hotel.propertyId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
