import { atProperty } from '../../shared/utils/property-access';
import { prisma } from '../../shared/utils/prisma';

type Actor = { userId: number; propertyId: number };
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

async function activeStaff(actor: Actor) {
  const user = await prisma.user.findFirst({ where: { userId: actor.userId, ...atProperty(actor.propertyId), isActive: true }, include: { role: true } });
  if (!user) throw fail('Active hotel staff required.', 403);
  return user;
}

// Managers always; receptionists only when a manager has granted it.
export function canManageOnlineRooms(user: { canManageOnlineRooms: boolean; role: { roleName: string } }) {
  return user.role.roleName === 'Manager' || (user.role.roleName === 'Receptionist' && user.canManageOnlineRooms);
}

export async function onlineRoomAccess(actor: Actor) {
  return { canManageOnlineRooms: canManageOnlineRooms(await activeStaff(actor)) };
}

export async function setRoomOnlineBooking(actor: Actor, roomId: number, enabled: unknown) {
  if (typeof enabled !== 'boolean') throw fail('Choose whether the room can be booked online.');
  const user = await activeStaff(actor);
  if (!canManageOnlineRooms(user)) throw fail('Ask a manager for permission to change online booking for rooms.', 403);
  const room = await prisma.room.findFirst({ where: { roomId, propertyId: actor.propertyId }, select: { roomId: true, roomNumber: true, isOnlineBookable: true } });
  if (!room) throw fail('Room not found.', 404);
  if (room.isOnlineBookable === enabled) return room;
  const [updated] = await prisma.$transaction([
    prisma.room.update({ where: { roomId }, data: { isOnlineBookable: enabled }, select: { roomId: true, roomNumber: true, isOnlineBookable: true } }),
    prisma.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Room', entityId: roomId, action: enabled ? 'RoomShownOnline' : 'RoomHiddenOnline', oldData: { isOnlineBookable: room.isOnlineBookable }, newData: { isOnlineBookable: enabled, roomNumber: room.roomNumber } } }),
  ]);
  return updated;
}

export async function setOnlineRoomPermission(actor: Actor, userId: number, enabled: unknown) {
  if (typeof enabled !== 'boolean') throw fail('Choose whether to allow this permission.');
  const manager = await activeStaff(actor);
  if (manager.role.roleName !== 'Manager') throw fail('Only a hotel manager can change this permission.', 403);
  const target = await prisma.user.findFirst({ where: { userId, ...atProperty(actor.propertyId) }, include: { role: true } });
  if (!target || target.role.roleName !== 'Receptionist') throw fail('Choose a receptionist from your hotel.');
  if (target.canManageOnlineRooms === enabled) return { userId, canManageOnlineRooms: enabled };
  await prisma.$transaction([
    prisma.user.update({ where: { userId }, data: { canManageOnlineRooms: enabled } }),
    prisma.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'User', entityId: userId, action: 'OnlineRoomPermissionChanged', oldData: { canManageOnlineRooms: target.canManageOnlineRooms }, newData: { canManageOnlineRooms: enabled } } }),
  ]);
  return { userId, canManageOnlineRooms: enabled };
}
