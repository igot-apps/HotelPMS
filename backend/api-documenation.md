# 📚 Hotel PMS API - Complete Documentation for Frontend Development

Here's a complete markdown file you can give to the AI to generate the frontend. It includes all endpoints with request/response examples.

```markdown
# Hotel PMS API - Frontend Development Guide

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

### 1. Login
**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "username": "gtetteh",
  "password": "manager123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "userId": 2,
      "fullName": "Grace Tetteh",
      "username": "gtetteh",
      "email": "grace.tetteh@brassfieldhotel.com",
      "role": "General Manager",
      "tenantId": 1,
      "tenantName": "Brassfield Hotel",
      "propertyId": 1,
      "permissions": ["CanCreateReservation", "CanCancelReservation", "CanCheckInGuest", "CanCheckOutGuest", "CanManageRates", "CanViewFinancialReports", "CanProcessPayments", "CanIssueRefunds", "CanManageHousekeeping", "CanManageMaintenance", "CanManageStaffAndRoles"]
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid username or password"
}
```

### 2. Refresh Token
**Endpoint:** `POST /auth/refresh-token`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### 3. Get Current User
**Endpoint:** `GET /auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": 2,
    "fullName": "Grace Tetteh",
    "username": "gtetteh",
    "email": "grace.tetteh@brassfieldhotel.com",
    "role": "General Manager",
    "tenantId": 1,
    "tenantName": "Brassfield Hotel",
    "propertyId": 1,
    "isActive": true,
    "lastLoginAt": "2026-06-28T10:00:00.000Z",
    "createdAt": "2026-06-01T00:00:00.000Z"
  }
}
```

### 4. Logout
**Endpoint:** `POST /auth/logout`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🏢 Tenant Endpoints

### 1. Get All Tenants
**Endpoint:** `GET /tenants?page=1&limit=10`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "tenantId": 1,
      "tenantCode": "BRASSFIELD",
      "businessName": "Brassfield Hotel",
      "legalName": "Brassfield Hospitality Ltd.",
      "subscriptionPlan": "Growth",
      "subscriptionStatus": "Active",
      "currency": "GHS",
      "timezone": "Africa/Accra",
      "country": "Ghana",
      "primaryEmail": "info@brassfieldhotel.com",
      "primaryPhone": "0244000001",
      "isActive": true,
      "_count": {
        "properties": 2,
        "users": 3,
        "guests": 5
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1
  }
}
```

### 2. Get Tenant by ID
**Endpoint:** `GET /tenants/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": 1,
    "tenantCode": "BRASSFIELD",
    "businessName": "Brassfield Hotel",
    "legalName": "Brassfield Hospitality Ltd.",
    "subscriptionPlan": "Growth",
    "subscriptionStatus": "Active",
    "currency": "GHS",
    "timezone": "Africa/Accra",
    "country": "Ghana",
    "primaryEmail": "info@brassfieldhotel.com",
    "primaryPhone": "0244000001",
    "isActive": true,
    "properties": [
      {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra",
        "propertyCode": "BFH-ACC"
      }
    ],
    "users": [
      {
        "userId": 1,
        "fullName": "John Mensah",
        "username": "jmensah",
        "email": "john.mensah@brassfieldhotel.com",
        "role": {
          "roleId": 4,
          "roleName": "Front Desk"
        }
      }
    ],
    "_count": {
      "properties": 2,
      "users": 3,
      "guests": 5,
      "rooms": 25,
      "reservations": 9
    }
  }
}
```

### 3. Get Tenant Stats
**Endpoint:** `GET /tenants/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": 1,
    "businessName": "Brassfield Hotel",
    "totalProperties": 2,
    "totalUsers": 3,
    "totalGuests": 5,
    "totalRooms": 25,
    "totalReservations": 9,
    "currentOccupancy": 3,
    "totalPayments": 8,
    "totalRevenue": 890,
    "subscriptionPlan": "Growth",
    "subscriptionStatus": "Active"
  }
}
```

### 4. Create Tenant
**Endpoint:** `POST /tenants`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "tenantCode": "SUNSET",
  "businessName": "Sunset Beach Resort",
  "legalName": "Sunset Beach Resorts Ltd.",
  "country": "Ghana",
  "primaryEmail": "info@sunsetbeach.com",
  "primaryPhone": "0244000003",
  "subscriptionPlan": "Starter"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": 3,
    "tenantCode": "SUNSET",
    "businessName": "Sunset Beach Resort",
    "legalName": "Sunset Beach Resorts Ltd.",
    "subscriptionPlan": "Starter",
    "subscriptionStatus": "Active",
    "currency": "GHS",
    "timezone": "Africa/Accra",
    "country": "Ghana",
    "primaryEmail": "info@sunsetbeach.com",
    "primaryPhone": "0244000003",
    "createdDate": "2026-06-28T00:00:00.000Z",
    "updatedDate": "2026-06-28T00:00:00.000Z",
    "isActive": true
  }
}
```

### 5. Update Tenant
**Endpoint:** `PUT /tenants/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "businessName": "Brassfield Luxury Hotel",
  "subscriptionPlan": "Enterprise"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": 1,
    "businessName": "Brassfield Luxury Hotel",
    "subscriptionPlan": "Enterprise"
  }
}
```

### 6. Delete Tenant
**Endpoint:** `DELETE /tenants/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Tenant deactivated successfully"
}
```

---

## 🏨 Property Endpoints

### 1. Get All Properties
**Endpoint:** `GET /properties?page=1&limit=10&tenantId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "propertyId": 1,
      "tenantId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC",
      "propertyType": "Hotel",
      "address": "12 Independence Ave",
      "city": "Accra",
      "country": "Ghana",
      "gpsCoordinates": "5.6037,-0.1870",
      "totalRooms": 10,
      "checkInTime": "14:00",
      "checkOutTime": "11:00",
      "status": "Active",
      "tenant": {
        "tenantId": 1,
        "businessName": "Brassfield Hotel",
        "tenantCode": "BRASSFIELD"
      },
      "_count": {
        "rooms": 10,
        "users": 3,
        "reservations": 9
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5,
    "totalPages": 1
  }
}
```

### 2. Get Property by ID
**Endpoint:** `GET /properties/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "propertyId": 1,
    "tenantId": 1,
    "propertyName": "Brassfield Hotel - Accra",
    "propertyCode": "BFH-ACC",
    "propertyType": "Hotel",
    "address": "12 Independence Ave",
    "city": "Accra",
    "country": "Ghana",
    "gpsCoordinates": "5.6037,-0.1870",
    "totalRooms": 10,
    "checkInTime": "14:00",
    "checkOutTime": "11:00",
    "status": "Active",
    "tenant": {
      "tenantId": 1,
      "businessName": "Brassfield Hotel",
      "tenantCode": "BRASSFIELD"
    },
    "rooms": [
      {
        "roomId": 1,
        "roomNumber": "101",
        "roomType": {
          "roomTypeId": 1,
          "typeName": "Standard Single"
        }
      }
    ],
    "roomTypes": [
      {
        "roomTypeId": 1,
        "typeName": "Standard Single",
        "basePrice": 30.00
      }
    ],
    "users": [
      {
        "userId": 1,
        "fullName": "John Mensah",
        "username": "jmensah"
      }
    ],
    "_count": {
      "rooms": 10,
      "users": 3,
      "reservations": 9
    }
  }
}
```

### 3. Get Property Stats
**Endpoint:** `GET /properties/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "propertyId": 1,
    "propertyName": "Brassfield Hotel - Accra",
    "totalRooms": 10,
    "occupiedRooms": 3,
    "availableRooms": 7,
    "totalUsers": 3,
    "totalReservations": 9,
    "currentOccupancy": 3,
    "occupancyRate": 30,
    "status": "Active"
  }
}
```

### 4. Get Properties by Tenant
**Endpoint:** `GET /properties/tenant/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:** Same as Get All Properties

### 5. Create Property
**Endpoint:** `POST /properties`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyName": "Brassfield Airport Hotel",
  "propertyCode": "BFH-AIR",
  "propertyType": "Hotel",
  "address": "Airport Road",
  "city": "Accra",
  "country": "Ghana",
  "gpsCoordinates": "5.6000,-0.1700",
  "totalRooms": 15,
  "checkInTime": "14:00",
  "checkOutTime": "12:00",
  "status": "Active"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "propertyId": 2,
    "tenantId": 1,
    "propertyName": "Brassfield Airport Hotel",
    "propertyCode": "BFH-AIR",
    "propertyType": "Hotel",
    "address": "Airport Road",
    "city": "Accra",
    "country": "Ghana",
    "gpsCoordinates": "5.6000,-0.1700",
    "totalRooms": 15,
    "checkInTime": "14:00",
    "checkOutTime": "12:00",
    "status": "Active",
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z"
  }
}
```

### 6. Update Property
**Endpoint:** `PUT /properties/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyName": "Brassfield Airport Luxury Hotel",
  "totalRooms": 20
}
```

### 7. Delete Property
**Endpoint:** `DELETE /properties/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Property deactivated successfully"
}
```

---

## 🛏️ Room Inventory Endpoints

### Room Types

#### 1. Get All Room Types
**Endpoint:** `GET /rooms/types?page=1&limit=10&propertyId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "roomTypeId": 1,
      "tenantId": 1,
      "propertyId": 1,
      "typeName": "Standard Single",
      "description": "Single bed, basic amenities",
      "basePrice": "30.00",
      "maxOccupancy": 1,
      "isActive": true,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z",
      "property": {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra",
        "propertyCode": "BFH-ACC"
      },
      "_count": {
        "rooms": 3,
        "ratePlans": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 13,
    "totalPages": 2
  }
}
```

#### 2. Get Room Type by ID
**Endpoint:** `GET /rooms/types/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "roomTypeId": 1,
    "tenantId": 1,
    "propertyId": 1,
    "typeName": "Standard Single",
    "description": "Single bed, basic amenities",
    "basePrice": "30.00",
    "maxOccupancy": 1,
    "isActive": true,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-01T00:00:00.000Z",
    "property": {
      "propertyId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC",
      "tenantId": 1
    },
    "rooms": [
      {
        "roomId": 1,
        "roomNumber": "101",
        "reservationRooms": []
      }
    ],
    "ratePlans": [
      {
        "ratePlanId": 1,
        "planName": "Standard Rate"
      }
    ],
    "_count": {
      "rooms": 3,
      "ratePlans": 1
    }
  }
}
```

#### 3. Get Room Type Stats
**Endpoint:** `GET /rooms/types/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "roomTypeId": 1,
    "typeName": "Standard Single",
    "basePrice": "30.00",
    "maxOccupancy": 1,
    "totalRooms": 3,
    "availableRooms": 2,
    "occupiedRooms": 1,
    "totalRatePlans": 1,
    "isActive": true
  }
}
```

#### 4. Create Room Type
**Endpoint:** `POST /rooms/types`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyId": 1,
  "typeName": "Deluxe Suite",
  "description": "Luxury suite with living area",
  "basePrice": 85.00,
  "maxOccupancy": 3
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "roomTypeId": 14,
    "tenantId": 1,
    "propertyId": 1,
    "typeName": "Deluxe Suite",
    "description": "Luxury suite with living area",
    "basePrice": "85.00",
    "maxOccupancy": 3,
    "isActive": true,
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z"
  }
}
```

#### 5. Update Room Type
**Endpoint:** `PUT /rooms/types/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "typeName": "Executive Suite",
  "basePrice": 95.00
}
```

#### 6. Delete Room Type
**Endpoint:** `DELETE /rooms/types/:id`

**Headers:** `Authorization: Bearer <token>`

---

### Rooms

#### 1. Get All Rooms
**Endpoint:** `GET /rooms?page=1&limit=10&propertyId=1&roomTypeId=1&status=Available`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "roomId": 1,
      "tenantId": 1,
      "propertyId": 1,
      "roomNumber": "101",
      "roomTypeId": 1,
      "floor": 1,
      "operationalStatus": "Available",
      "housekeepingStatus": "Clean",
      "notes": null,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z",
      "roomType": {
        "roomTypeId": 1,
        "typeName": "Standard Single",
        "basePrice": "30.00"
      },
      "property": {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra",
        "propertyCode": "BFH-ACC"
      },
      "_count": {
        "reservationRooms": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

#### 2. Get Room by ID
**Endpoint:** `GET /rooms/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "roomId": 1,
    "tenantId": 1,
    "propertyId": 1,
    "roomNumber": "101",
    "roomTypeId": 1,
    "floor": 1,
    "operationalStatus": "Available",
    "housekeepingStatus": "Clean",
    "notes": null,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-01T00:00:00.000Z",
    "roomType": {
      "roomTypeId": 1,
      "typeName": "Standard Single",
      "basePrice": "30.00",
      "maxOccupancy": 1
    },
    "property": {
      "propertyId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC",
      "tenantId": 1
    },
    "reservationRooms": [
      {
        "reservationId": 1,
        "guestId": 1,
        "guest": {
          "fullName": "Kwame Asante",
          "email": "kwame.a@email.com",
          "phone": "0244123456"
        },
        "checkInDate": "2026-06-20T00:00:00.000Z",
        "checkOutDate": "2026-06-22T00:00:00.000Z"
      }
    ]
  }
}
```

#### 3. Get Available Rooms
**Endpoint:** `GET /rooms/available?checkInDate=2026-07-01&checkOutDate=2026-07-05&propertyId=1&roomTypeId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "roomId": 1,
      "tenantId": 1,
      "propertyId": 1,
      "roomNumber": "101",
      "roomTypeId": 1,
      "floor": 1,
      "operationalStatus": "Available",
      "housekeepingStatus": "Clean",
      "roomType": {
        "roomTypeId": 1,
        "typeName": "Standard Single",
        "basePrice": "30.00"
      },
      "reservationRooms": []
    }
  ],
  "count": 5
}
```

#### 4. Create Room
**Endpoint:** `POST /rooms`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyId": 1,
  "roomNumber": "501",
  "roomTypeId": 1,
  "floor": 5,
  "operationalStatus": "Available",
  "housekeepingStatus": "Clean",
  "notes": "Top floor with view"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "roomId": 46,
    "tenantId": 1,
    "propertyId": 1,
    "roomNumber": "501",
    "roomTypeId": 1,
    "floor": 5,
    "operationalStatus": "Available",
    "housekeepingStatus": "Clean",
    "notes": "Top floor with view",
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z",
    "roomType": {
      "roomTypeId": 1,
      "typeName": "Standard Single",
      "basePrice": "30.00"
    },
    "property": {
      "propertyId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC"
    }
  }
}
```

#### 5. Update Room
**Endpoint:** `PUT /rooms/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "roomNumber": "502",
  "floor": 5,
  "notes": "Renovated - new furniture"
}
```

#### 6. Update Room Status
**Endpoint:** `PATCH /rooms/:id/status`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "operationalStatus": "Maintenance",
  "housekeepingStatus": "OutOfService"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "roomId": 1,
    "operationalStatus": "Maintenance",
    "housekeepingStatus": "OutOfService"
  }
}
```

#### 7. Delete Room
**Endpoint:** `DELETE /rooms/:id`

**Headers:** `Authorization: Bearer <token>`

---

### Rate Plans

#### 1. Get All Rate Plans
**Endpoint:** `GET /rooms/rate-plans?page=1&limit=10&propertyId=1&roomTypeId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "ratePlanId": 1,
      "tenantId": 1,
      "propertyId": 1,
      "roomTypeId": 1,
      "planName": "Standard Rate",
      "description": null,
      "isPublic": true,
      "minStay": 1,
      "maxStay": 14,
      "discountPercent": "0",
      "isActive": true,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z",
      "roomType": {
        "roomTypeId": 1,
        "typeName": "Standard Single",
        "basePrice": "30.00"
      },
      "property": {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra",
        "propertyCode": "BFH-ACC"
      },
      "_count": {
        "reservationRooms": 2
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 13,
    "totalPages": 2
  }
}
```

#### 2. Get Rate Plan by ID
**Endpoint:** `GET /rooms/rate-plans/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "ratePlanId": 1,
    "tenantId": 1,
    "propertyId": 1,
    "roomTypeId": 1,
    "planName": "Standard Rate",
    "description": null,
    "isPublic": true,
    "minStay": 1,
    "maxStay": 14,
    "discountPercent": "0",
    "isActive": true,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-01T00:00:00.000Z",
    "roomType": {
      "roomTypeId": 1,
      "typeName": "Standard Single",
      "basePrice": "30.00"
    },
    "property": {
      "propertyId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC",
      "tenantId": 1
    }
  }
}
```

#### 3. Create Rate Plan
**Endpoint:** `POST /rooms/rate-plans`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyId": 1,
  "roomTypeId": 1,
  "planName": "Weekend Special",
  "description": "Premium weekend rate",
  "isPublic": true,
  "minStay": 2,
  "maxStay": 3,
  "discountPercent": 15
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "ratePlanId": 14,
    "tenantId": 1,
    "propertyId": 1,
    "roomTypeId": 1,
    "planName": "Weekend Special",
    "description": "Premium weekend rate",
    "isPublic": true,
    "minStay": 2,
    "maxStay": 3,
    "discountPercent": "15",
    "isActive": true,
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z",
    "roomType": {
      "roomTypeId": 1,
      "typeName": "Standard Single",
      "basePrice": "30.00"
    }
  }
}
```

#### 4. Update Rate Plan
**Endpoint:** `PUT /rooms/rate-plans/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "planName": "Premium Weekend Rate",
  "discountPercent": 20,
  "minStay": 2,
  "maxStay": 5
}
```

#### 5. Delete Rate Plan
**Endpoint:** `DELETE /rooms/rate-plans/:id`

**Headers:** `Authorization: Bearer <token>`

---

## 👤 Guest Endpoints

### 1. Get All Guests
**Endpoint:** `GET /guests?page=1&limit=10&search=Kwame`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "guestId": 1,
      "tenantId": 1,
      "fullName": "Kwame Asante",
      "phone": "0244123456",
      "email": "kwame.a@email.com",
      "idNumber": "GHA-001",
      "address": "Accra, Ghana",
      "city": null,
      "country": null,
      "username": "kasante",
      "passwordHash": null,
      "dateRegistered": "2026-06-01T00:00:00.000Z",
      "lastStayDate": "2026-06-22T00:00:00.000Z",
      "totalStays": 2,
      "notes": null,
      "isActive": true,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-28T00:00:00.000Z",
      "_count": {
        "reservations": 2
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 9,
    "totalPages": 1
  }
}
```

### 2. Search Guests
**Endpoint:** `GET /guests/search?q=Kwame&page=1&limit=10`

**Headers:** `Authorization: Bearer <token>`

**Response:** Same as Get All Guests

### 3. Get Guest by ID
**Endpoint:** `GET /guests/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": 1,
    "tenantId": 1,
    "fullName": "Kwame Asante",
    "phone": "0244123456",
    "email": "kwame.a@email.com",
    "idNumber": "GHA-001",
    "address": "Accra, Ghana",
    "city": null,
    "country": null,
    "username": "kasante",
    "passwordHash": null,
    "dateRegistered": "2026-06-01T00:00:00.000Z",
    "lastStayDate": "2026-06-22T00:00:00.000Z",
    "totalStays": 2,
    "notes": null,
    "isActive": true,
    "createdAt": "2026-06-01T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z",
    "reservations": [
      {
        "reservationId": 1,
        "propertyId": 1,
        "property": {
          "propertyId": 1,
          "propertyName": "Brassfield Hotel - Accra"
        },
        "checkInDate": "2026-06-20T00:00:00.000Z",
        "checkOutDate": "2026-06-22T00:00:00.000Z",
        "status": "CheckedIn",
        "totalAmount": 90.00,
        "amountPaid": 90.00,
        "balanceDue": 0.00,
        "reservationRooms": [
          {
            "roomId": 1,
            "room": {
              "roomNumber": "101",
              "roomType": {
                "typeName": "Standard Single"
              }
            },
            "agreedPricePerNight": 45.00
          }
        ],
        "payments": [
          {
            "paymentId": 1,
            "amount": 90.00,
            "paymentMethod": "Cash",
            "paymentDate": "2026-06-20T00:00:00.000Z"
          }
        ]
      }
    ]
  }
}
```

### 4. Get Guest Stats
**Endpoint:** `GET /guests/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": 1,
    "fullName": "Kwame Asante",
    "email": "kwame.a@email.com",
    "phone": "0244123456",
    "totalReservations": 2,
    "completedStays": 1,
    "totalSpent": 90,
    "dateRegistered": "2026-06-01T00:00:00.000Z",
    "lastStayDate": "2026-06-22T00:00:00.000Z",
    "isActive": true
  }
}
```

### 5. Get Guest Reservations
**Endpoint:** `GET /guests/:id/reservations`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "reservationId": 1,
      "propertyId": 1,
      "property": {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra"
      },
      "checkInDate": "2026-06-20T00:00:00.000Z",
      "checkOutDate": "2026-06-22T00:00:00.000Z",
      "status": "CheckedIn",
      "totalAmount": 90.00,
      "amountPaid": 90.00,
      "balanceDue": 0.00,
      "reservationRooms": [
        {
          "roomId": 1,
          "room": {
            "roomNumber": "101",
            "roomType": {
              "typeName": "Standard Single"
            }
          },
          "agreedPricePerNight": 45.00        }
      ],
      "payments": [
        {
          "paymentId": 1,
          "amount": 90.00,
          "paymentMethod": "Cash",
          "paymentDate": "2026-06-20T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

### 6. Create Guest
**Endpoint:** `POST /guests`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "fullName": "John Smith",
  "phone": "0244000005",
  "email": "john.smith@email.com",
  "idNumber": "GHA-012",
  "address": "123 Main Street",
  "city": "Accra",
  "country": "Ghana",
  "username": "jsmith",
  "password": "guest123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "guestId": 10,
    "tenantId": 1,
    "fullName": "John Smith",
    "phone": "0244000005",
    "email": "john.smith@email.com",
    "idNumber": "GHA-012",
    "address": "123 Main Street",
    "city": "Accra",
    "country": "Ghana",
    "username": "jsmith",
    "passwordHash": "$2a$10$...",
    "dateRegistered": "2026-06-28T00:00:00.000Z",
    "lastStayDate": null,
    "totalStays": 0,
    "notes": null,
    "isActive": true,
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z"
  }
}
```

### 7. Update Guest
**Endpoint:** `PUT /guests/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "fullName": "John Smith Jr.",
  "phone": "0244000006",
  "city": "Kumasi"
}
```

### 8. Delete Guest
**Endpoint:** `DELETE /guests/:id`

**Headers:** `Authorization: Bearer <token>`

---

## 📅 Reservation Endpoints

### 1. Get All Reservations
**Endpoint:** `GET /reservations?page=1&limit=10&propertyId=1&status=Confirmed&guestId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "reservationId": 1,
      "tenantId": 1,
      "propertyId": 1,
      "guestId": 1,
      "staffId": 1,
      "source": "Walk-in",
      "checkInDate": "2026-06-20T00:00:00.000Z",
      "checkOutDate": "2026-06-22T00:00:00.000Z",
      "status": "CheckedIn",
      "notes": "Late check-in expected",
      "totalAmount": 90.00,
      "amountPaid": 90.00,
      "balanceDue": 0.00,
      "createdAt": "2026-06-20T00:00:00.000Z",
      "updatedAt": "2026-06-20T00:00:00.000Z",
      "guest": {
        "guestId": 1,
        "fullName": "Kwame Asante",
        "email": "kwame.a@email.com",
        "phone": "0244123456"
      },
      "property": {
        "propertyId": 1,
        "propertyName": "Brassfield Hotel - Accra",
        "propertyCode": "BFH-ACC"
      },
      "staff": {
        "userId": 1,
        "fullName": "John Mensah",
        "username": "jmensah"
      },
      "reservationRooms": [
        {
          "reservationRoomId": 1,
          "roomId": 1,
          "room": {
            "roomId": 1,
            "roomNumber": "101",
            "operationalStatus": "Occupied",
            "roomType": {
              "roomTypeId": 1,
              "typeName": "Standard Single",
              "basePrice": "30.00"
            }
          },
          "ratePlan": null,
          "checkInDate": "2026-06-20T00:00:00.000Z",
          "checkOutDate": "2026-06-22T00:00:00.000Z",
          "agreedPricePerNight": 45.00
        }
      ],
      "payments": [
        {
          "paymentId": 1,
          "amount": 90.00,
          "paymentMethod": "Cash",
          "paymentDate": "2026-06-20T00:00:00.000Z"
        }
      ],
      "_count": {
        "payments": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 9,
    "totalPages": 1
  }
}
```

### 2. Get Reservation by ID
**Endpoint:** `GET /reservations/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:** Same as individual reservation object above

### 3. Get Reservation Stats
**Endpoint:** `GET /reservations/:id/stats`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "reservationId": 1,
    "totalRooms": 1,
    "totalNights": 2,
    "totalAmount": 90.00,
    "totalPaid": 90.00,
    "balanceDue": 0.00,
    "paymentStatus": "Paid",
    "status": "CheckedIn"
  }
}
```

### 4. Get Reservations by Date Range
**Endpoint:** `GET /reservations/date-range?fromDate=2026-06-01&toDate=2026-06-30&propertyId=1`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "reservationId": 1,
      "guestId": 1,
      "guest": {
        "fullName": "Kwame Asante",
        "email": "kwame.a@email.com",
        "phone": "0244123456"
      },
      "checkInDate": "2026-06-20T00:00:00.000Z",
      "checkOutDate": "2026-06-22T00:00:00.000Z",
      "status": "CheckedIn",
      "reservationRooms": [
        {
          "roomId": 1,
          "room": {
            "roomNumber": "101",
            "roomType": {
              "typeName": "Standard Single"
            }
          }
        }
      ]
    }
  ],
  "count": 6
}
```

### 5. Create Reservation (Single Room)
**Endpoint:** `POST /reservations`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyId": 1,
  "guestId": 1,
  "source": "Website",
  "checkInDate": "2026-07-15",
  "checkOutDate": "2026-07-18",
  "rooms": [
    {
      "roomId": 1,
      "roomTypeId": 1,
      "agreedPricePerNight": 45.00
    }
  ],
  "amountPaid": 45.00,
  "notes": "Business traveler - prefers quiet floor"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reservationId": 10,
    "tenantId": 1,
    "propertyId": 1,
    "guestId": 1,
    "staffId": 2,
    "source": "Website",
    "checkInDate": "2026-07-15T00:00:00.000Z",
    "checkOutDate": "2026-07-18T00:00:00.000Z",
    "status": "Confirmed",
    "notes": "Business traveler - prefers quiet floor",
    "totalAmount": 135.00,
    "amountPaid": 45.00,
    "balanceDue": 90.00,
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z",
    "guest": {
      "guestId": 1,
      "fullName": "Kwame Asante",
      "email": "kwame.a@email.com",
      "phone": "0244123456"
    },
    "property": {
      "propertyId": 1,
      "propertyName": "Brassfield Hotel - Accra",
      "propertyCode": "BFH-ACC"
    },
    "staff": {
      "userId": 2,
      "fullName": "Grace Tetteh",
      "username": "gtetteh"
    },
    "reservationRooms": [
      {
        "reservationRoomId": 10,
        "roomId": 1,
        "roomTypeId": 1,
        "ratePlanId": null,
        "checkInDate": "2026-07-15T00:00:00.000Z",
        "checkOutDate": "2026-07-18T00:00:00.000Z",
        "agreedPricePerNight": 45.00,
        "room": {
          "roomId": 1,
          "roomNumber": "101",
          "operationalStatus": "Occupied",
          "roomType": {
            "roomTypeId": 1,
            "typeName": "Standard Single",
            "basePrice": "30.00"
          }
        },
        "ratePlan": null
      }
    ],
    "payments": [],
    "_count": {
      "payments": 0
    }
  }
}
```

### 6. Create Reservation (Multiple Rooms)
**Endpoint:** `POST /reservations`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "propertyId": 1,
  "guestId": 1,
  "source": "Phone",
  "checkInDate": "2026-08-01",
  "checkOutDate": "2026-08-05",
  "rooms": [
    {
      "roomId": 1,
      "roomTypeId": 1,
      "agreedPricePerNight": 45.00
    },
    {
      "roomId": 2,
      "roomTypeId": 2,
      "agreedPricePerNight": 65.00
    }
  ],
  "amountPaid": 110.00,
  "notes": "Family - 2 rooms"
}
```

### 7. Update Reservation
**Endpoint:** `PUT /reservations/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "notes": "Updated - guest requests early check-in",
  "source": "Direct"
}
```

### 8. Cancel Reservation
**Endpoint:** `DELETE /reservations/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "reservationId": 4,
    "status": "Cancelled"
  }
}
```

### 9. Check-In Guest
**Endpoint:** `POST /reservations/:id/check-in`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "reservationId": 2,
    "status": "CheckedIn"
  },
  "message": "Guest checked in successfully"
}
```

### 10. Check-Out Guest
**Endpoint:** `POST /reservations/:id/check-out`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "reservationId": 2,
    "status": "CheckedOut"
  },
  "message": "Guest checked out successfully"
}
```

---

## 💰 Payment Endpoints

### 1. Get All Payments
**Endpoint:** `GET /payments?page=1&limit=10&reservationId=1&paymentMethod=Cash&status=Completed`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "paymentId": 1,
      "tenantId": 1,
      "reservationId": 1,
      "amount": 90.00,
      "paymentMethod": "Cash",
      "paymentDate": "2026-06-20T00:00:00.000Z",
      "gatewayReference": null,
      "receivedBy": 1,
      "status": "Completed",
      "notes": null,
      "createdAt": "2026-06-20T00:00:00.000Z",
      "updatedAt": "2026-06-20T00:00:00.000Z",
      "reservation": {
        "reservationId": 1,
        "guestId": 1,
        "totalAmount": 90.00,
        "amountPaid": 90.00,
        "balanceDue": 0.00,
        "guest": {
          "fullName": "Kwame Asante",
          "email": "kwame.a@email.com",
          "phone": "0244123456"
        }
      },
      "receiver": {
        "userId": 1,
        "fullName": "John Mensah",
        "username": "jmensah"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 8,
    "totalPages": 1
  }
}
```

### 2. Get Payment by ID
**Endpoint:** `GET /payments/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:** Same as individual payment object above

### 3. Get Payments by Reservation
**Endpoint:** `GET /payments/reservation/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "paymentId": 1,
      "amount": 90.00,
      "paymentMethod": "Cash",
      "paymentDate": "2026-06-20T00:00:00.000Z",
      "status": "Completed",
      "receiver": {
        "userId": 1,
        "fullName": "John Mensah",
        "username": "jmensah"
      }
    }
  ],
  "count": 1
}
```

### 4. Get Payment Statistics
**Endpoint:** `GET /payments/statistics`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPayments": 8,
    "totalAmount": 890,
    "byMethod": [
      {
        "method": "Cash",
        "count": 3,
        "total": 340
      },
      {
        "method": "Card",
        "count": 2,
        "total": 340
      },
      {
        "method": "MobileMoney",
        "count": 2,
        "total": 140
      },
      {
        "method": "Online",
        "count": 1,
        "total": 45
      }
    ],
    "byStatus": [
      {
        "status": "Completed",
        "count": 8
      }
    ]
  }
}
```

### 5. Record Payment
**Endpoint:** `POST /payments`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "reservationId": 2,
  "amount": 45.00,
  "paymentMethod": "MobileMoney",
  "gatewayReference": "MM-REF-12345",
  "notes": "Partial payment for reservation"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": 9,
    "tenantId": 1,
    "reservationId": 2,
    "amount": 45.00,
    "paymentMethod": "MobileMoney",
    "paymentDate": "2026-06-28T00:00:00.000Z",
    "gatewayReference": "MM-REF-12345",
    "receivedBy": 2,
    "status": "Completed",
    "notes": "Partial payment for reservation",
    "createdAt": "2026-06-28T00:00:00.000Z",
    "updatedAt": "2026-06-28T00:00:00.000Z",
    "reservation": {
      "reservationId": 2,
      "totalAmount": 90.00,
      "amountPaid": 105.00,
      "balanceDue": 0.00,
      "guest": {
        "fullName": "Abena Owusu",
        "email": "abena.o@email.com",
        "phone": "0501234567"
      }
    },
    "receiver": {
      "userId": 2,
      "fullName": "Grace Tetteh",
      "username": "gtetteh"
    }
  },
  "message": "Payment recorded successfully"
}
```

### 6. Update Payment
**Endpoint:** `PUT /payments/:id`

**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "notes": "Corrected payment - verified",
  "gatewayReference": "MM-REF-UPDATED"
}
```

### 7. Refund Payment
**Endpoint:** `DELETE /payments/:id`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Payment refunded successfully"
}
```

---

## 📊 Report Endpoints

### 1. Occupancy Report
**Endpoint:** `GET /reports/occupancy?propertyId=1&fromDate=2026-06-01&toDate=2026-06-30`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRooms": 10,
    "occupiedRoomNights": 12,
    "totalRoomNights": 300,
    "occupancyRate": 4.00,
    "days": 30,
    "fromDate": "2026-06-01T00:00:00.000Z",
    "toDate": "2026-06-30T00:00:00.000Z"
  }
}
```

### 2. Revenue Report
**Endpoint:** `GET /reports/revenue?propertyId=1&fromDate=2026-06-01&toDate=2026-06-30`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 890,
    "totalPayments": 8,
    "byMethod": [
      {
        "method": "Cash",
        "count": 3,
        "total": 340
      },
      {
        "method": "Card",
        "count": 2,
        "total": 340
      },
      {
        "method": "MobileMoney",
        "count": 2,
        "total": 140
      },
      {
        "method": "Online",
        "count": 1,
        "total": 45
      }
    ],
    "byRoomType": [
      {
        "roomTypeId": 1,
        "roomTypeName": "Standard Single",
        "roomNights": 4,
        "revenue": 180
      },
      {
        "roomTypeId": 2,
        "roomTypeName": "Standard Double",
        "roomNights": 2,
        "revenue": 130
      },
      {
        "roomTypeId": 3,
        "roomTypeName": "Executive Suite",
        "roomNights": 2,
        "revenue": 170
      }
    ],
    "fromDate": "2026-06-01T00:00:00.000Z",
    "toDate": "2026-06-30T00:00:00.000Z"
  }
}
```

### 3. Reservation Report
**Endpoint:** `GET /reports/reservations?propertyId=1&fromDate=2026-06-01&toDate=2026-06-30`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalReservations": 6,
    "totalAmount": 890,
    "totalPaid": 890,
    "balanceDue": 0,
    "averageLengthOfStay": 2.00,
    "byStatus": [
      {
        "status": "CheckedIn",
        "count": 1
      },
      {
        "status": "Confirmed",
        "count": 2
      },
      {
        "status": "CheckedOut",
        "count": 1
      },
      {
        "status": "Cancelled",
        "count": 1
      }
    ],
    "bySource": [
      {
        "source": "Walk-in",
        "count": 2
      },
      {
        "source": "Phone",
        "count": 2
      },
      {
        "source": "Website",
        "count": 1
      },
      {
        "source": "Direct",
        "count": 1
      }
    ],
    "reservations": [
      {
        "reservationId": 1,
        "guestId": 1,
        "source": "Walk-in",
        "checkInDate": "2026-06-20T00:00:00.000Z",
        "checkOutDate": "2026-06-22T00:00:00.000Z",
        "status": "CheckedIn",
        "totalAmount": 90,
        "amountPaid": 90,
        "balanceDue": 0
      }
    ],
    "fromDate": "2026-06-01T00:00:00.000Z",
    "toDate": "2026-06-30T00:00:00.000Z"
  }
}
```

### 4. Guest Report
**Endpoint:** `GET /reports/guests?propertyId=1&fromDate=2026-06-01&toDate=2026-06-30`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "totalGuests": 3,
    "newGuests": 2,
    "returningGuests": 1,
    "returningRate": 33.33,
    "totalSpent": 890,
    "averageSpent": 296.67,
    "guests": [
      {
        "guestId": 1,
        "fullName": "Kwame Asante",
        "email": "kwame.a@email.com",
        "phone": "0244123456",
        "totalStays": 2,
        "totalSpent": 180,
        "stays": 2
      },
      {
        "guestId": 2,
        "fullName": "Abena Owusu",
        "email": "abena.o@email.com",
        "phone": "0501234567",
        "totalStays": 1,
        "totalSpent": 90,
        "stays": 1
      }
    ],
    "fromDate": "2026-06-01T00:00:00.000Z",
    "toDate": "2026-06-30T00:00:00.000Z"
  }
}
```

### 5. Daily Summary
**Endpoint:** `GET /reports/daily-summary?propertyId=1&date=2026-06-28`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-06-28T00:00:00.000Z",
    "checkIns": 2,
    "checkOuts": 1,
    "currentOccupancy": 3,
    "totalRooms": 10,
    "occupancyRate": 30.00,
    "totalRevenue": 135,
    "totalPayments": 3,
    "averageRate": 45.00,
    "reservations": 4
  }
}
```

### 6. Monthly Summary
**Endpoint:** `GET /reports/monthly-summary?propertyId=1&month=6&year=2026`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "month": "2026-06",
    "days": 30,
    "totalCheckIns": 8,
    "totalCheckOuts": 6,
    "totalRevenue": 890,
    "totalPayments": 8,
    "totalReservations": 9,
    "averageOccupancy": 25.50,
    "dailyData": [
      {
        "date": "2026-06-01T00:00:00.000Z",
        "checkIns": 0,
        "checkOuts": 0,
        "currentOccupancy": 0,
        "totalRooms": 10,
        "occupancyRate": 0,
        "totalRevenue": 0,
        "totalPayments": 0,
        "averageRate": 0,
        "reservations": 0
      }
    ]
  }
}
```

---

## 📋 Quick Reference - Test Credentials

| Username | Password | Role | Tenant |
|----------|----------|------|--------|
| jmensah | reception123 | Front Desk | Brassfield |
| gtetteh | manager123 | General Manager | Brassfield |
| efosu | reception123 | Front Desk | Gold Coast |
| kdarko | manager123 | General Manager | Gold Coast |
| eappiah | reception123 | Front Desk | Sunset |
| kobbah | manager123 | General Manager | Sunset |

---

## 🔧 Common Error Responses

### 401 Unauthorized
```json
{
  "success": false,
  "message": "No token provided"
}
```
or
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "You do not have access to this resource"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["propertyId"],
      "message": "Required"
    }
  ]
}
```

---

## 🎯 Frontend Implementation Tips

1. **Store the token**: After login, store the `accessToken` in localStorage or sessionStorage
2. **Add token to headers**: Always include `Authorization: Bearer <token>` for protected routes
3. **Handle token expiry**: When receiving 401, redirect to login or refresh token
4. **Pagination**: All list endpoints support `page` and `limit` query parameters
5. **Date formatting**: Use `YYYY-MM-DD` format for dates in requests
6. **Decimal values**: All monetary values are returned as strings from Prisma - parse with `parseFloat()`

---

**This documentation covers all endpoints needed for a complete Hotel PMS frontend application.** 🚀
```

---

## 📝 How to Use This File

1. **Save as `API_DOCUMENTATION.md`** in your project root
2. **Give this file to the AI** generating your frontend
3. **The AI will have**:
   - All endpoints with exact URLs
   - Complete request/response examples
   - Required headers and authentication
   - Data structure for every operation

The AI can now generate accurate frontend code without guessing the API structure! 🎯