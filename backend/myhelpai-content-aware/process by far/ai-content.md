# 📋 AI Context Files - Complete Update

Based on our completed work, here are the fully updated context files:

---

# `CURRENT_PROGRESS.md`

# 🏨 Hotel PMS Backend - Current Progress

## 📊 Overall Status: 100% Complete! 🎉

| Phase | Module | Status | Completion |
|-------|--------|--------|------------|
| 0 | Project Setup | ✅ Complete | 100% |
| 1 | Database Schema | ✅ Complete | 100% |
| 2 | Authentication | ✅ Complete | 100% |
| 3 | Tenant Management | ✅ Complete | 100% |
| 4 | Property Management | ✅ Complete | 100% |
| 5 | Room Inventory | ✅ Complete | 100% |
| 6 | Guest Management | ✅ Complete | 100% |
| 7 | Reservation Management | ✅ Complete | 100% |
| 8 | Payment Management | ✅ Complete | 100% |
| 9 | Reports Module | ✅ Complete | 100% |

**Overall Progress: 100% Complete! 🎉**

---

## ✅ Completed Modules

### Phase 0: Project Foundation
- Node.js + TypeScript with Express
- PostgreSQL with Docker
- Prisma ORM with complete schema
- Jest testing framework configured
- Environment management with dotenv

### Phase 1: Database Schema
- **14 Tables**: tenants, properties, users, roles, permissions, role_permissions, guests, room_types, rooms, rate_plans, reservations, reservation_rooms, payments, audit_logs
- All relationships properly defined with `onDelete: Cascade`
- Complete seed data with 2 tenants, 2 properties, 6 roles, 4 users, 11 permissions

### Phase 2: Authentication Module
- JWT token generation (access + refresh)
- Password hashing with bcrypt
- **Endpoints**:
  - `POST /api/auth/login` - Login
  - `POST /api/auth/refresh-token` - Refresh token
  - `GET /api/auth/me` - Get current user (Protected)
  - `POST /api/auth/logout` - Logout (Protected)
- Middleware: authenticate, requireRole, requirePermission
- Test users: jmensah (Front Desk), gtetteh (Manager), efosu (Front Desk), kdarko (Manager)

### Phase 3: Tenant Module
- **Endpoints**:
  - `POST /api/tenants` - Create tenant
  - `GET /api/tenants` - List tenants (paginated)
  - `GET /api/tenants/:id` - Get tenant by ID
  - `GET /api/tenants/:id/stats` - Get tenant statistics
  - `PUT /api/tenants/:id` - Update tenant
  - `DELETE /api/tenants/:id` - Soft delete tenant
- Features: Tenant isolation, duplicate code check, comprehensive stats

### Phase 4: Property Module
- **Endpoints**:
  - `POST /api/properties` - Create property
  - `GET /api/properties` - List properties (paginated, filter by tenant)
  - `GET /api/properties/:id` - Get property by ID
  - `GET /api/properties/tenant/:id` - Get properties by tenant
  - `GET /api/properties/:id/stats` - Get property statistics
  - `PUT /api/properties/:id` - Update property
  - `DELETE /api/properties/:id` - Soft delete property
- Features: Auto tenant assignment, tenant isolation, occupancy tracking

### Phase 5: Room Inventory Module
- **Room Type Endpoints**:
  - `POST /api/rooms/types` - Create room type
  - `GET /api/rooms/types` - List room types
  - `GET /api/rooms/types/:id` - Get room type by ID
  - `GET /api/rooms/types/:id/stats` - Get room type stats
  - `PUT /api/rooms/types/:id` - Update room type
  - `DELETE /api/rooms/types/:id` - Delete room type

- **Room Endpoints**:
  - `POST /api/rooms` - Create room
  - `GET /api/rooms` - List rooms (filter by status, type, property)
  - `GET /api/rooms/available` - Check availability
  - `GET /api/rooms/:id` - Get room by ID
  - `PUT /api/rooms/:id` - Update room
  - `PATCH /api/rooms/:id/status` - Update room status
  - `DELETE /api/rooms/:id` - Delete room

- **Rate Plan Endpoints**:
  - `POST /api/rooms/rate-plans` - Create rate plan
  - `GET /api/rooms/rate-plans` - List rate plans
  - `GET /api/rooms/rate-plans/:id` - Get rate plan by ID
  - `PUT /api/rooms/rate-plans/:id` - Update rate plan
  - `DELETE /api/rooms/rate-plans/:id` - Delete rate plan

### Phase 6: Guest Module
- **Endpoints**:
  - `POST /api/guests` - Create guest
  - `GET /api/guests` - List guests (paginated, search)
  - `GET /api/guests/search?q=` - Search guests
  - `GET /api/guests/:id` - Get guest by ID
  - `GET /api/guests/:id/stats` - Get guest statistics
  - `GET /api/guests/:id/reservations` - Get guest's reservations
  - `PUT /api/guests/:id` - Update guest
  - `DELETE /api/guests/:id` - Soft delete guest

### Phase 7: Reservation Module
- **Endpoints**:
  - `POST /api/reservations` - Create reservation (single/multi-room)
  - `GET /api/reservations` - List reservations (with filters)
  - `GET /api/reservations/date-range` - Get by date range
  - `GET /api/reservations/:id` - Get reservation by ID
  - `GET /api/reservations/:id/stats` - Get reservation stats
  - `PUT /api/reservations/:id` - Update reservation
  - `DELETE /api/reservations/:id` - Cancel reservation
  - `POST /api/reservations/:id/check-in` - Check-in guest
  - `POST /api/reservations/:id/check-out` - Check-out guest
- Features: Multi-room support, availability checking, automatic room status updates

### Phase 8: Payment Module
- **Endpoints**:
  - `POST /api/payments` - Record payment
  - `GET /api/payments` - List payments (with filters)
  - `GET /api/payments/statistics` - Payment statistics
  - `GET /api/payments/reservation/:id` - Payments by reservation
  - `GET /api/payments/:id` - Get payment by ID
  - `PUT /api/payments/:id` - Update payment
  - `DELETE /api/payments/:id` - Refund payment
- Features: Multiple payment methods, partial payments, automatic balance updates

### Phase 9: Reports Module
- **Endpoints**:
  - `GET /api/reports/occupancy` - Occupancy report
  - `GET /api/reports/revenue` - Revenue report
  - `GET /api/reports/reservations` - Reservation report
  - `GET /api/reports/guests` - Guest report
  - `GET /api/reports/daily-summary` - Daily summary
  - `GET /api/reports/monthly-summary` - Monthly summary
- Features: Date range filtering, daily/monthly aggregation, comprehensive analytics

---

## 🗄️ Database Schema

### Tables (14)
| Table | Purpose |
|-------|---------|
| tenants | Multi-tenant isolation |
| properties | Hotels/resorts per tenant |
| users | Staff with RBAC |
| roles | Role definitions |
| permissions | Permission definitions |
| role_permissions | Many-to-many roles↔permissions |
| guests | Guest profiles |
| room_types | Room categories |
| rooms | Individual rooms |
| rate_plans | Pricing rules |
| reservations | Booking records |
| reservation_rooms | Rooms per reservation |
| payments | Payment records |
| audit_logs | System audit trail |

---

## 🔐 Test Credentials

| Username | Password | Role | Tenant |
|----------|----------|------|--------|
| jmensah | reception123 | Front Desk | Brassfield |
| gtetteh | manager123 | General Manager | Brassfield |
| efosu | reception123 | Front Desk | Gold Coast |
| kdarko | manager123 | General Manager | Gold Coast |

---

## 🛠️ Development Commands

```bash
# Start PostgreSQL
docker-compose up -d

# Run migrations
npx prisma migrate dev

# Seed database
npm run prisma:seed

# Start development server
npm run dev

# Open Prisma Studio
npx prisma studio

# Run tests
npm test
```

---

# `API.md`

# 📚 Hotel PMS API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication

All protected endpoints require a Bearer token:
```
Authorization: Bearer <access_token>
```

---

## 🔐 Authentication Endpoints

### Login
```http
POST /auth/login
```
**Request:**
```json
{
  "username": "jmensah",
  "password": "reception123"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "userId": 1,
      "fullName": "John Mensah",
      "username": "jmensah",
      "email": "john.mensah@brassfieldhotel.com",
      "role": "Front Desk",
      "tenantId": 1,
      "tenantName": "Brassfield Hotel",
      "propertyId": 1,
      "permissions": ["CanCreateReservation", "CanCheckInGuest", "CanCheckOutGuest", "CanProcessPayments"]
    }
  }
}
```

### Refresh Token
```http
POST /auth/refresh-token
```
**Request:**
```json
{ "refreshToken": "eyJ..." }
```

### Get Current User
```http
GET /auth/me
```

### Logout
```http
POST /auth/logout
```

---

## 🏢 Tenant Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tenants` | Create tenant |
| GET | `/tenants` | List tenants (paginated) |
| GET | `/tenants/:id` | Get tenant by ID |
| GET | `/tenants/:id/stats` | Get tenant statistics |
| PUT | `/tenants/:id` | Update tenant |
| DELETE | `/tenants/:id` | Soft delete tenant |

---

## 🏨 Property Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/properties` | Create property |
| GET | `/properties` | List properties |
| GET | `/properties/:id` | Get property by ID |
| GET | `/properties/tenant/:id` | Properties by tenant |
| GET | `/properties/:id/stats` | Property statistics |
| PUT | `/properties/:id` | Update property |
| DELETE | `/properties/:id` | Soft delete property |

---

## 🛏️ Room Inventory Endpoints

### Room Types
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rooms/types` | Create room type |
| GET | `/rooms/types` | List room types |
| GET | `/rooms/types/:id` | Get room type |
| GET | `/rooms/types/:id/stats` | Room type stats |
| PUT | `/rooms/types/:id` | Update room type |
| DELETE | `/rooms/types/:id` | Delete room type |

### Rooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rooms` | Create room |
| GET | `/rooms` | List rooms |
| GET | `/rooms/available` | Check availability |
| GET | `/rooms/:id` | Get room |
| PUT | `/rooms/:id` | Update room |
| PATCH | `/rooms/:id/status` | Update room status |
| DELETE | `/rooms/:id` | Delete room |

### Rate Plans
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/rooms/rate-plans` | Create rate plan |
| GET | `/rooms/rate-plans` | List rate plans |
| GET | `/rooms/rate-plans/:id` | Get rate plan |
| PUT | `/rooms/rate-plans/:id` | Update rate plan |
| DELETE | `/rooms/rate-plans/:id` | Delete rate plan |

---

## 👤 Guest Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/guests` | Create guest |
| GET | `/guests` | List guests |
| GET | `/guests/search` | Search guests |
| GET | `/guests/:id` | Get guest |
| GET | `/guests/:id/stats` | Guest statistics |
| GET | `/guests/:id/reservations` | Guest reservations |
| PUT | `/guests/:id` | Update guest |
| DELETE | `/guests/:id` | Delete guest |

---

## 📅 Reservation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/reservations` | Create reservation |
| GET | `/reservations` | List reservations |
| GET | `/reservations/date-range` | By date range |
| GET | `/reservations/:id` | Get reservation |
| GET | `/reservations/:id/stats` | Reservation stats |
| PUT | `/reservations/:id` | Update reservation |
| DELETE | `/reservations/:id` | Cancel reservation |
| POST | `/reservations/:id/check-in` | Check-in guest |
| POST | `/reservations/:id/check-out` | Check-out guest |

---

## 💰 Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/payments` | Record payment |
| GET | `/payments` | List payments |
| GET | `/payments/statistics` | Payment statistics |
| GET | `/payments/reservation/:id` | Payments by reservation |
| GET | `/payments/:id` | Get payment |
| PUT | `/payments/:id` | Update payment |
| DELETE | `/payments/:id` | Refund payment |

---

## 📊 Report Endpoints

| Method | Endpoint | Description | Required Params |
|--------|----------|-------------|-----------------|
| GET | `/reports/occupancy` | Occupancy report | propertyId, fromDate, toDate |
| GET | `/reports/revenue` | Revenue report | propertyId, fromDate, toDate |
| GET | `/reports/reservations` | Reservation report | propertyId, fromDate, toDate |
| GET | `/reports/guests` | Guest report | propertyId, fromDate, toDate |
| GET | `/reports/daily-summary` | Daily summary | propertyId, date |
| GET | `/reports/monthly-summary` | Monthly summary | propertyId, month, year |

---

## 📊 Common Response Formats

### Success
```json
{
  "success": true,
  "data": { ... },
  "pagination": { ... }  // Where applicable
}
```

### Error
```json
{
  "success": false,
  "message": "Error description"
}
```

### Pagination
```json
{
  "page": 1,
  "limit": 10,
  "total": 100,
  "totalPages": 10
}
```

---

# `BUSINESS_RULES.md`

# 📋 Hotel PMS - Business Rules

## 🏢 Multi-Tenancy Rules

1. **Tenant Isolation**
   - Every record belongs to exactly one tenant
   - Users can only access data from their tenant
   - Properties belong to one tenant
   - No cross-tenant data sharing

2. **Tenant Creation**
   - Tenant code must be unique
   - All tenants start with 'Starter' subscription
   - Soft delete only (isActive = false)

## 👥 User & RBAC Rules

1. **Authentication**
   - JWT tokens expire after 7 days
   - Refresh tokens expire after 30 days
   - Passwords must be hashed with bcrypt

2. **Roles**
   - System roles: Super Admin, General Manager, Front Desk, Reservations Agent, Accountant, Housekeeping
   - Roles are tenant-agnostic
   - Users belong to one role

3. **Permissions**
   - Permissions are code-based (e.g., 'CanCreateReservation')
   - Roles can have multiple permissions

## 🛏️ Room Rules

1. **Room Types**
   - Each room type belongs to a property
   - Base price is per night
   - Max occupancy defines guest capacity

2. **Rooms**
   - Room numbers are unique per property
   - Statuses: Available, Occupied, Maintenance, OutOfService
   - Housekeeping: Clean, Dirty, Inspected, OutOfService

3. **Rate Plans**
   - Can be public or private
   - Minimum and maximum stay restrictions
   - Discount percentage can be applied

## 📅 Reservation Rules

1. **Reservation Flow**
   - Status flow: Pending → Confirmed → CheckedIn → CheckedOut
   - Alternative: Pending → Cancelled
   - NoShow after check-in date passes

2. **Multi-Room Reservations**
   - A reservation can have multiple rooms
   - Each room has its own check-in/out dates
   - Each room can have different rate plans

3. **Availability**
   - Rooms cannot be double-booked
   - Check-in/out dates must be valid (check-in < check-out)
   - Availability checked per room, per date range

## 💰 Payment Rules

1. **Payment Processing**
   - Multiple payment methods: Cash, Card, MobileMoney, Online, BankTransfer
   - Payments are linked to reservations
   - Partial payments allowed
   - Payment status: Pending, Completed, Failed, Refunded

2. **Financial Tracking**
   - Total amount, amount paid, balance due tracked per reservation
   - Revenue calculated from completed payments
   - Payment history maintained indefinitely

## 👤 Guest Rules

1. **Guest Management**
   - Guests are tenant-specific
   - Email must be unique per tenant
   - Soft delete (isActive = false)
   - Track total stays and last stay date

2. **Guest Search**
   - Search by name, email, phone, ID number
   - Case-insensitive partial matching
   - Minimum 2 characters for search

## 📊 Report Rules

1. **Occupancy Report**
   - Calculates room nights and occupancy rate
   - Excludes OutOfService rooms
   - Date range must be valid

2. **Revenue Report**
   - Only includes completed payments
   - Breaks down by payment method and room type
   - Date range must be valid

3. **Reservation Report**
   - Includes all reservations in date range
   - Breaks down by status and source
   - Calculates average length of stay

4. **Guest Report**
   - New vs returning guests
   - Calculates total and average spending
   - Guest details included

## 🔒 Data Integrity Rules

1. **Soft Delete**
   - Never hard delete records
   - Use isActive/status flags
   - Maintain audit trail

2. **Audit Log**
   - All create/update/delete operations logged
   - Store old and new data as JSON
   - Track user, IP, timestamp

---

# `CODING_STANDARDS.md`

# 📐 Hotel PMS - Coding Standards

## 🏗️ Project Structure

```
src/
├── modules/
│   ├── auth/
│   ├── tenant/
│   ├── property/
│   ├── room/
│   ├── guest/
│   ├── reservation/
│   ├── payment/
│   └── report/
├── shared/
│   ├── middleware/
│   ├── utils/
│   ├── errors/
│   └── types/
└── app.ts
```

## 📝 File Naming Conventions

```
✅ Use kebab-case for files:
  - tenant.controller.ts
  - guest.service.ts
  - auth.middleware.ts

✅ Use PascalCase for classes:
  - class TenantController
  - class GuestService

✅ Use camelCase for variables/functions:
  - const getUserById
  - function createTenant
```

## 🎯 Module Pattern

### Repository Pattern
```typescript
// repository.ts - Data access layer
export const findUserById = async (id: number) => {
  return prisma.user.findUnique({ where: { userId: id } });
};
```

### Service Pattern
```typescript
// service.ts - Business logic
export const getUserById = async (id: number) => {
  const user = await userRepository.findUserById(id);
  if (!user) throw new Error('User not found');
  return user;
};
```

### Controller Pattern
```typescript
// controller.ts - HTTP handling
export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await userService.getUserById(req.params.id);
    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    return res.status(404).json({ success: false, message: error.message });
  }
};
```

## 🔐 Authentication & Authorization

```typescript
// Always authenticate routes
router.use(authenticate);

// Protect with roles
router.post('/', requireRole([1, 2, 3]), controller.create);
```

## 🛠️ Error Handling

```typescript
// Use try/catch in controllers
try {
  // Business logic
} catch (error: any) {
  return res.status(400).json({
    success: false,
    message: error.message,
  });
}
```

## 📊 API Response Format

```typescript
// Success
return res.status(200).json({
  success: true,
  data: result,
  pagination: { page, limit, total, totalPages }
});

// Error
return res.status(400).json({
  success: false,
  message: 'Error description'
});
```

## 🗄️ Prisma Usage

```typescript
// Include relations
await prisma.reservation.findUnique({
  where: { reservationId: id },
  include: {
    guest: true,
    property: true,
    reservationRooms: {
      include: { room: { include: { roomType: true } } }
    }
  }
});

// Soft delete
await prisma.tenant.update({
  where: { tenantId: id },
  data: { isActive: false }
});

// Aggregations
await prisma.payment.aggregate({
  where: { tenantId },
  _sum: { amount: true },
  _count: { paymentId: true }
});
```

## 🧪 Testing

```typescript
// Unit tests
describe('Reservation Service', () => {
  test('createReservation creates reservation', async () => {
    const reservation = await createReservation(data);
    expect(reservation).toBeDefined();
  });
});
```

## 💡 Best Practices

1. **Always validate input** - Use Zod schemas
2. **Never expose raw errors** - Sanitize error messages
3. **Use soft delete** - Never hard delete records
4. **Keep tenant isolation** - Always filter by tenantId
5. **Return consistent responses** - Use success/error format
6. **Log important operations** - Use audit logs
7. **Keep services stateless** - No side effects in services
8. **Use TypeScript** - Always define types and interfaces
9. **Add pagination** - For all list endpoints
10. **Use proper status codes** - 201 for create, 200 for success, 400 for validation

---

## 📝 Context Update Complete!

These files represent the **current state** of the project:
- ✅ All 9 phases completed
- ✅ 56+ API endpoints
- ✅ 14 database tables
- ✅ Full authentication & RBAC
- ✅ Complete reservation workflow
- ✅ Payment processing
- ✅ Reporting & analytics
- ✅ All modules tested and working

---

**The Hotel PMS Backend is 100% Complete! 🎉**