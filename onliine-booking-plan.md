I actually think you should keep the name Guest. In the hotel domain, everyone (receptionists, managers, accountants, auditors) thinks in terms of Guests, not "Platform Users." so how can we achieve something like this in relation to our built . Goals:

1. Keep the existing domain terminology.
   
   - Continue using the Guest model.
   - Continue using Property, Reservation, User, Payment, Room, etc.
   - Do not introduce models such as PlatformUser or Customer unless there is no alternative.

2. Redesign Guest so that it becomes the single source of truth across the platform.
   
   - A Guest should exist only once.
   - The same Guest can reserve rooms at many different Properties.
   - Remove the concept that every Property owns its own Guest.

3. Modify only the relationships necessary.
   
   - Explain which relations should change.
   - Explain which fields should be removed.
   - Explain which fields should be added.
   - Preserve as much of the existing schema as possible.

4. Walk-in guests.
   Reception should be able to create a Guest even if the guest has never registered online.
   Later that Guest should be able to activate or claim their online account without creating a second Guest record.

5. Prevent duplicate Guests.
   Consider phone number, email, passport, Ghana Card, and OTP verification.
   Do not automatically merge records solely because of matching phone numbers.

6. Hotel-specific information.
   Hotels should still be able to maintain information such as:
   
   - VIP status
   - Internal notes
   - Stay count
   - Last stay
   - Blacklisted
     without duplicating the Guest record.

7. Produce:
   
   - Updated ER diagram.
   - Updated Prisma models based on my existing schema.
   - Migration strategy from the current schema.
   - Advantages and disadvantages of the proposed design.
   - Any potential edge cases.

Important:
Use my uploaded schema as the foundation. Refactor it rather than replacing it with a completely different design.





This is a **masterclass in Domain-Driven Design (DDD)**. You are absolutely right: in the hospitality industry, the term "Guest" carries specific operational weight. Introducing "PlatformUser" creates a cognitive disconnect for your hotel staff. 

By keeping the `Guest` model but elevating it to a **Global Single Source of Truth**, we satisfy both the business domain (Hotel Staff sees "Guests") and the technical architecture (One identity across the platform).

Here is the complete architectural redesign based on your exact requirements.

---

### 1. The Architecture: Global Guest + Property Folio

To achieve this without duplicating the core `Guest` record, we will split the concept into two technical models, while keeping the domain language intact:

1. **`Guest` (Global Identity):** Holds core identity (Name, Email, Phone, Passport) and optional online credentials. This record exists **only once** per human.
2. **`GuestProfile` (The "Hotel Folio"):** A junction/detail table that links a `Guest` to a specific `Property`. This is where hotel-specific data (VIP status, internal notes, blacklist) lives. 

When a receptionist looks at their dashboard, they query `GuestProfile` for their property, which seamlessly includes the global `Guest` data. To them, it's just a "Guest".

---

### 2. Text-Based ER Diagram

```text
[Property] 1 ──── M [GuestProfile] M ──── 1 [Guest] (Global)
   │                      │                      │
   │                      │ (Hotel-specific:     │ (Core Identity:
   │                      │  VIP, Notes,         │  Name, Email, Phone,
   │                      │  Blacklist)          │  Passport, Password)
   │                      │                      │
   │                      └──────────────────────┘
   │                                             │
   ├── 1 ──── M [Room] ──── 1 [RoomType]         ├── 1 ──── M [Reservation]
   │                                             │
   └── 1 ──── M [Payment] <──────────────────────┘
```

---

### 3. Updated Prisma Models

Here is the refactored schema. We are removing `propertyId` from `Guest`, introducing `GuestProfile`, and updating `Reservation`.

```prisma
// ==========================================
// 1. GLOBAL GUEST (Single Source of Truth)
// ==========================================
model Guest {
  guestId         Int       @id @default(autoincrement())

  // Core Identity (Global)
  firstName       String
  lastName        String
  email           String?   @unique
  phoneNumber     String?   @unique
  passportNumber  String?   @unique
  ghanaCardNumber String?   @unique

  // Online Account (Optional, populated upon claiming)
  passwordHash    String?
  isVerified      Boolean   @default(false) // OTP verified

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  reservations    Reservation[]
  profiles        GuestProfile[] // Link to property-specific data
  payments        Payment[]      // Assuming payments link to guest
}

// ==========================================
// 2. PROPERTY-SPECIFIC GUEST DATA (The "Folio")
// ==========================================
model GuestProfile {
  guestProfileId  Int       @id @default(autoincrement())
  guestId         Int
  propertyId      Int

  // Hotel-specific attributes
  vipStatus       String?   // e.g., "Gold", "Silver"
  internalNotes   String?   // Only visible to this hotel
  stayCount       Int       @default(0)
  lastStayDate    DateTime?
  isBlacklisted   Boolean   @default(false)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  guest           Guest     @relation(fields: [guestId], references: [guestId], onDelete: Cascade)
  property        Property  @relation(fields: [propertyId], references: [propertyId])

  @@unique([guestId, propertyId]) // A guest has exactly one profile per property
}

// ==========================================
// 3. RESERVATION (Updated Relation)
// ==========================================
model Reservation {
  // ... (keep all existing fields: reservationId, propertyId, roomId, dates, etc.) ...

  guestId         Int       // Now points to the GLOBAL Guest

  // ... (keep existing relations to Room, Property, etc.) ...
  guest           Guest     @relation(fields: [guestId], references: [guestId])
}
```

---

### 4. How the Flows Work

#### A. The Walk-In Flow (Reception)

1. Receptionist creates a guest with just a Name and Phone Number.
2. **Backend Logic:** Checks if `phoneNumber` exists globally. 
   - *If yes:* Fetches the existing `Guest`.
   - *If no:* Creates a new global `Guest`.
3. **Backend Logic:** Checks if a `GuestProfile` exists for this `Guest` at the current `Property`.
   - *If no:* Creates a `GuestProfile` linking them.
4. The guest is now in the hotel's system. No online account exists yet (`passwordHash` is null).

#### B. The Claiming Flow (Online)

1. The guest goes to your public website and clicks "Claim Account".
2. They enter their Phone Number. The system finds the global `Guest`.
3. System sends an OTP. Guest verifies it (`isVerified = true`).
4. Guest sets a password (`passwordHash` is saved).
5. **Result:** The walk-in is now a full platform user. If they book at Hotel B next week, the backend simply creates a new `GuestProfile` for Hotel B.

#### C. Preventing Duplicates

Because `email`, `phoneNumber`, `passportNumber`, and `ghanaCardNumber` have the `@unique` constraint, the database physically prevents duplicates. 

* **Rule:** We **never** auto-merge. If a receptionist creates a walk-in with a phone number that already exists, the backend simply returns the existing `Guest` and attaches a new `GuestProfile`. The historical data remains intact.

---

### 5. Migration Strategy (Crucial)

Since you already have data where `Guest` is tied to `Property`, you cannot just run `prisma migrate dev`. You must do a **Data Migration**.

**Step 1: The Script**
Write a TypeScript script (using your `prisma-playground.ts` tool!) to do the following:

1. Create the new `GuestProfile` table (via a temporary schema change).
2. Loop through every existing `Guest`.
3. For each `Guest`, create a `GuestProfile` using their current `propertyId`. Move any hotel-specific fields (if you had them) to this new profile.
4. **Handle Duplicates:** If you have guests with the *same email/phone* across different properties, you must nullify the email/phone on the duplicates, OR append a suffix (e.g., `+1`), because the next step requires global uniqueness.
5. Remove `propertyId` from the `Guest` model.
6. Apply the `@unique` constraints to `email`, `phoneNumber`, etc.

**Step 2: Execution**

1. Run the data migration script.
2. Update your `schema.prisma` to the final version shown above.
3. Run `npx prisma migrate dev --name global_guest_redesign`.

---

### 6. Advantages & Disadvantages

#### ✅ Advantages

1. **True Domain Alignment:** Staff still call them "Guests". No confusing "PlatformUser" terminology.
2. **Platform-Wide Loyalty:** You can now easily build a global loyalty program because you can count total stays across all properties for a single `Guest`.
3. **Cleaner Public API:** The public booking engine only interacts with the global `Guest` model for authentication and profile management.
4. **Data Integrity:** Eliminates the nightmare of "John Doe" existing 5 times across 5 hotels with 5 different phone numbers.

#### ❌ Disadvantages

1. **Complex Migration:** Moving from tenant-specific to global requires careful data scripting to avoid unique constraint violations.
2. **Slightly Complex Queries:** When a hotel queries their guests, they must query `GuestProfile` and `include: { guest: true }`. (This is easily handled in your repository layer).
3. **Cascade Deletes:** If a `Guest` is deleted globally, they are deleted from all hotels. (Mitigated by using `isBlacklisted` or soft deletes instead of hard deletes).

---

### 7. Potential Edge Cases to Watch For

1. **The "Ghost" Walk-In:** A receptionist creates a walk-in named "John Doe" with no phone or email. Later, a real John Doe registers online. They will be two separate records. 
   * *Solution:* This is acceptable. Without a unique identifier (phone/email/ID), they are technically different people in the system.
2. **Changing Phone Numbers:** If a guest changes their phone number, they must go through an OTP verification flow to update the `@unique` `phoneNumber` field. Your backend must handle the transaction of updating the unique field safely.
3. **Blacklisting:** If Hotel A blacklists a guest, it only updates `GuestProfile.isBlacklisted`. Hotel B cannot see this unless you build a "Platform-wide Blacklist" feature (which would require a flag on the global `Guest` model).

### Next Steps

If you approve of this architecture, our immediate next step is to **write the Data Migration Script** using your `playground-cli.js` tool to safely transform your existing database before we touch the Prisma schema. 

Shall we write the migration script?
