export const PERMISSIONS = {
  // Reservations
  CAN_CREATE_RESERVATION: 'CanCreateReservation',
  CAN_CANCEL_RESERVATION: 'CanCancelReservation',
  CAN_CHECK_IN_GUEST: 'CanCheckInGuest',
  CAN_CHECK_OUT_GUEST: 'CanCheckOutGuest',
  
  // Inventory (Rooms)
  CAN_VIEW_ROOMS: 'CanViewRooms',
  CAN_CREATE_ROOM: 'CanCreateRoom',
  CAN_UPDATE_ROOM: 'CanUpdateRoom',
  CAN_DELETE_ROOM: 'CanDeleteRoom',
  CAN_CREATE_ROOM_TYPE: 'CanCreateRoomType',
  CAN_UPDATE_ROOM_TYPE: 'CanUpdateRoomType',
  CAN_DELETE_ROOM_TYPE: 'CanDeleteRoomType',
  CAN_UPDATE_ROOM_STATUS: 'CanUpdateRoomStatus',
  CAN_MANAGE_RATES: 'CanManageRates',
  
  // Payments, Billing & Reports
  CAN_PROCESS_PAYMENTS: 'CanProcessPayments',
  CAN_ISSUE_REFUNDS: 'CanIssueRefunds',
  CAN_VIEW_FINANCIAL_REPORTS: 'CanViewFinancialReports',
  CAN_MANAGE_BILLING: 'CanManageBilling', // 🌟 NEW: Explicit Billing Permission
  
  // Operations & Admin
  CAN_MANAGE_HOUSEKEEPING: 'CanManageHousekeeping',
  CAN_MANAGE_MAINTENANCE: 'CanManageMaintenance',
  CAN_MANAGE_STAFF_AND_ROLES: 'CanManageStaffAndRoles',
};