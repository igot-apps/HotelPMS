import { atProperty, auditAt } from '../../shared/utils/property-access';
import { prisma } from '../../shared/utils/prisma';
import { dayBounds, hotelDate } from './daily-overview.service';

// Manager's activity log: everything staff did in the hotel, newest first, from the audit trail
// plus the records that carry their own "who" (bookings created, payments received).

const MAX_DAYS = 92;
const PAGE_SIZE = 50;
const DAY = 86_400_000;

export const ACTIVITY_KINDS = ['stays', 'bookings', 'money', 'corrections', 'settings'] as const;
type Kind = typeof ACTIVITY_KINDS[number];

const LABELS: Record<string, string> = {
  CheckedIn: 'Checked in', CheckedOut: 'Checked out', GuestMarkedOut: 'Guest marked out', GuestMarkedReturned: 'Guest marked back',
  DepartureVerified: 'Departure verified', RoomNoShow: 'Room marked no-show', ReservationNoShow: 'Booking marked no-show',
  ReservationCancelled: 'Booking cancelled', CreditCheckoutApproved: 'Checked out with money owed',
  'Correction:correct-date': 'Correction: departure date', 'Correction:undo-checkin': 'Correction: undo check-in',
  'Correction:undo-checkout': 'Correction: undo checkout', 'Correction:restore': 'Correction: restore booking',
  'Correction:transfer': 'Correction: room move', 'Correction:correct-payment': 'Correction: payment',
  'Correction:credit-checkout': 'Correction: checkout with money owed', 'Correction:record-departure': 'Correction: record departure',
  CorrectionRequested: 'Correction requested', CorrectionRequestApproved: 'Request approved', CorrectionRequestRejected: 'Request rejected',
  RefundRequested: 'Refund requested', RefundCompleted: 'Refund paid out', RefundSimulated: 'Refund (simulation)', SimulatedRefundSettled: 'Refund simulation settled',
  CashCountRecorded: 'Cash count recorded', CashCountIssueRecorded: 'Pending cash count reported', HousekeepingStatusChanged: 'Room cleaning status changed', HousekeepingSettingChanged: 'Housekeeping setting changed',
  CorrectionPermissionsChanged: 'Staff permissions changed', OnlineRoomPermissionChanged: 'Online room permission changed',
  RefundSimulationSettingChanged: 'Refund simulation setting changed', SmsSimulationSettingChanged: 'SMS simulation setting changed',
  PropertyDeactivated: 'Hotel deactivated', PropertyReactivated: 'Hotel reactivated',
  BookingCreated: 'Booking created', PaymentReceived: 'Payment received',
};

export const kindOf = (action: string): Kind => {
  if (action.startsWith('Correction') || action === 'CreditCheckoutApproved') return 'corrections';
  if (['CheckedIn', 'CheckedOut', 'GuestMarkedOut', 'GuestMarkedReturned', 'DepartureVerified', 'RoomNoShow', 'ReservationNoShow', 'HousekeepingStatusChanged'].includes(action)) return 'stays';
  if (['BookingCreated', 'ReservationCancelled'].includes(action)) return 'bookings';
  if (action.startsWith('Refund') || action.startsWith('SimulatedRefund') || ['PaymentReceived', 'CashCountRecorded'].includes(action)) return 'money';
  return 'settings';
};

const reservationIdOf = (data: any): string | null =>
  data?.reservationId ?? data?.value?.reservationId ?? data?.value?.reservation?.reservationId ?? data?.value?.result?.reservationId ?? null;

// A short plain-language detail for the row (the full record stays in the database).
function detailOf(action: string, data: any): string {
  const parts: string[] = [];
  const reason = data?.reason ?? data?.value?.result?.reason ?? data?.value?.reason;
  if (action === 'DepartureVerified') parts.push({ present: 'Guest still in the room', departed: 'Guest has left', unlocated: 'Guest cannot be found' }[data?.result as string] || String(data?.result || ''));
  if (data?.roomNumber) parts.push(`Room ${data.roomNumber}`);
  if (data?.value?.rooms?.length) parts.push(data.value.rooms.join(', '));
  const late = Number(data?.value?.lateMinutes || 0);
  if (late > 0) parts.push(`${late >= 1440 ? `${Math.floor(late / 1440)}d ` : ''}${late >= 60 ? `${Math.floor((late % 1440) / 60)}h ` : ''}${late % 60}m late`);
  if (data?.amount != null) parts.push(`GHS ${Number(data.amount).toFixed(2)}${data.method ? ` · ${data.method}` : ''}`);
  if (action === 'CashCountRecorded') parts.push(`Counted GHS ${Number(data.counted || 0).toFixed(2)} · expected GHS ${Number(data.expected || 0).toFixed(2)}`);
  if (action === 'HousekeepingStatusChanged' && data?.status) parts.push(`Now ${data.status === 'Dirty' ? 'needs cleaning' : data.status.toLowerCase()}`);
  if (action === 'CorrectionPermissionsChanged') parts.push(`Allowed: ${(data?.permissions || []).join(', ') || 'none'}`);
  if (data?.enabled != null) parts.push(data.enabled ? 'Turned on' : 'Turned off');
  if (reason && !['No reason given', 'Normal room lifecycle transition'].includes(reason)) parts.push(`Reason: ${reason}`);
  if (data?.note) parts.push(`Note: ${data.note}`);
  return parts.filter(Boolean).join(' · ');
}

export async function getActivityLog(userId: number, propertyId: number, query: { from?: string; to?: string; staffId?: string; kind?: string; page?: string }) {
  const manager = await prisma.user.findFirst({ where: { userId, ...atProperty(propertyId), isActive: true }, include: { role: true, property: { select: { timezone: true } } } });
  if (!manager || manager.role.roleName !== 'Manager') throw Object.assign(new Error('Only the hotel manager can view the activity log.'), { statusCode: 403 });
  // An owner working in another property uses that property's timezone, not their home's.
  const activeProperty = !manager.propertyId || manager.propertyId === propertyId ? manager.property : await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true } });
  const timeZone = activeProperty?.timezone || 'Africa/Accra';

  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const today = hotelDate(new Date(), timeZone);
  const to = isDate(query.to) ? query.to! : today;
  const from = isDate(query.from) ? query.from! : new Date(Date.parse(`${to}T00:00:00Z`) - 6 * DAY).toISOString().slice(0, 10);
  if (from > to) throw Object.assign(new Error('The start date must be on or before the end date.'), { statusCode: 400 });
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1 > MAX_DAYS) throw Object.assign(new Error(`Choose at most ${MAX_DAYS} days.`), { statusCode: 400 });
  const range = { gte: dayBounds(from, timeZone).gte, lt: dayBounds(to, timeZone).lt };

  const staffId = query.staffId ? Number(query.staffId) : undefined;
  if (query.staffId && !Number.isInteger(staffId)) throw Object.assign(new Error('Unknown staff member.'), { statusCode: 400 });
  const kind = (ACTIVITY_KINDS as readonly string[]).includes(query.kind || '') ? query.kind as Kind : undefined;
  const page = Math.max(1, Number(query.page) || 1);

  // Staff of this hotel (including deactivated accounts, so their past actions still show a name).
  const staff = await prisma.user.findMany({ where: atProperty(propertyId), select: { userId: true, fullName: true, isActive: true, role: { select: { roleName: true } } }, orderBy: { fullName: 'asc' } });
  const staffIds = staff.map(s => s.userId);
  const who = staffId ? [staffId].filter(id => staffIds.includes(id)) : staffIds;

  const [logs, bookings, payments] = await Promise.all([
    prisma.auditLog.findMany({ where: { userId: { in: who }, createdAt: range, ...auditAt(propertyId) }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    !kind || kind === 'bookings' ? prisma.reservation.findMany({ where: { propertyId, staffId: { in: who }, createdAt: range }, select: { reservationId: true, staffId: true, createdAt: true, source: true, totalAmount: true }, take: 5000 }) : [],
    !kind || kind === 'money' ? prisma.payment.findMany({ where: { reservation: { propertyId }, receivedBy: { in: who }, paymentDate: range }, select: { paymentId: true, reservationId: true, receivedBy: true, paymentDate: true, amount: true, paymentMethod: true, status: true }, take: 5000 }) : [],
  ]);

  type Row = { id: string; at: Date; userId: number | null; action: string; detail: string; reservationId: string | null };
  let rows: Row[] = [
    ...logs.map(log => ({ id: `a${log.auditLogId}`, at: log.createdAt, userId: log.userId, action: log.action, detail: detailOf(log.action, log.newData), reservationId: reservationIdOf(log.newData) })),
    ...bookings.map(b => ({ id: `b${b.reservationId}`, at: b.createdAt, userId: b.staffId, action: 'BookingCreated', detail: `${b.source} · GHS ${Number(b.totalAmount || 0).toFixed(2)}`, reservationId: b.reservationId })),
    ...payments.map(p => ({ id: `p${p.paymentId}`, at: p.paymentDate, userId: p.receivedBy, action: 'PaymentReceived', detail: `GHS ${Number(p.amount).toFixed(2)} · ${p.paymentMethod}${p.status !== 'Completed' ? ` · now ${p.status.toLowerCase()}` : ''}`, reservationId: p.reservationId })),
  ];
  if (kind) rows = rows.filter(row => kindOf(row.action) === kind);
  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id));

  const total = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const resIds = [...new Set(pageRows.map(r => r.reservationId).filter(Boolean))] as string[];
  const reservations = resIds.length ? await prisma.reservation.findMany({ where: { reservationId: { in: resIds }, propertyId }, select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true } }) : [];
  const resById = new Map(reservations.map(r => [r.reservationId, r]));
  const nameById = new Map(staff.map(s => [s.userId, s.fullName]));

  return {
    from, to, timeZone, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    staff: staff.map(s => ({ userId: s.userId, fullName: s.fullName, role: s.role.roleName, isActive: s.isActive })),
    items: pageRows.map(row => {
      const res = row.reservationId ? resById.get(row.reservationId) : undefined;
      return {
        id: row.id, at: row.at, action: row.action, label: LABELS[row.action] || row.action.replace(/([a-z])([A-Z])/g, '$1 $2'), kind: kindOf(row.action),
        staffName: (row.userId && nameById.get(row.userId)) || 'Former staff', detail: row.detail,
        reservationId: res?.reservationId || null, confirmationCode: res?.confirmationCode || null, guestName: res?.guestNameSnapshot || null,
      };
    }),
  };
}
