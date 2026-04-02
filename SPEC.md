# Stasis Inventory Management System

## Overview

In-person inventory management system for Stasis's hardware event. Lives in the existing Stasis repo, same database. Teams browse and order parts, rent tools, and interact via NFC badge scanning. Admins fulfill orders and track tool usage. Group Amazon account meets DoorDash.

---

## Tech Stack

Uses the existing Stasis stack:

- **Runtime:** Bun
- **Framework:** Next.js 14+ (App Router) -- existing repo
- **UI:** shadcn/ui + Tailwind CSS -- existing repo
- **ORM:** Prisma -- existing repo, extend the schema
- **Database:** Postgres -- existing DB
- **Auth:** Better Auth -- existing, cookie-based sessions (`better-auth.session_token`)
- **Roles/Permissions:** Existing `UserRole` / permissions system
- **Currency:** Existing `CurrencyTransaction` ledger -- read bits balance to gate inventory access (items are free, no transactions created)
- **Audit:** Existing `AuditLog`
- **Real-time:** Server-Sent Events (SSE) for live order/rental status updates
- **Slack DMs:** `@slack/web-api` `chat.postMessage` from API routes (user's `slackId` already on the User model)
- **NFC:** Web NFC API
- **Part images:** DigiKey Product Information API v4 (free tier, OAuth2 client credentials)

---

## New Prisma Models

Added to the existing schema alongside User, Session, CurrencyTransaction, etc. All relations reference the existing `User` model.

```prisma
model Team {
  id          String       @id @default(cuid())
  name        String       @unique
  locked      Boolean      @default(false)
  members     User[]       @relation("TeamMembers")
  orders      Order[]
  toolRentals ToolRental[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Item {
  id          String      @id @default(cuid())
  name        String
  description String?
  imageUrl    String?
  stock       Int
  category    String
  maxPerTeam  Int
  orderItems  OrderItem[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Tool {
  // Each row is a unique PHYSICAL tool, not a type.
  // 5 soldering irons = 5 rows. No stock field.
  id          String       @id @default(cuid())
  name        String
  description String?
  imageUrl    String?
  available   Boolean      @default(true)
  rentals     ToolRental[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

enum OrderStatus {
  PLACED
  IN_PROGRESS
  READY
  COMPLETED
}

model Order {
  id         String      @id @default(cuid())
  teamId     String
  team       Team        @relation(fields: [teamId], references: [id])
  placedById String
  placedBy   User        @relation("OrdersPlaced", fields: [placedById], references: [id])
  status     OrderStatus @default(PLACED)
  floor      Int
  location   String
  items      OrderItem[]
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt
}

model OrderItem {
  id       String @id @default(cuid())
  orderId  String
  order    Order  @relation(fields: [orderId], references: [id])
  itemId   String
  item     Item   @relation(fields: [itemId], references: [id])
  quantity Int
}

enum RentalStatus {
  CHECKED_OUT
  RETURNED
}

model ToolRental {
  id         String       @id @default(cuid())
  toolId     String
  tool       Tool         @relation(fields: [toolId], references: [id])
  teamId     String
  team       Team         @relation(fields: [teamId], references: [id])
  rentedById String
  rentedBy   User         @relation("ToolsRented", fields: [rentedById], references: [id])
  status     RentalStatus @default(CHECKED_OUT)
  floor      Int
  location   String
  dueAt      DateTime?
  returnedAt DateTime?
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt
}

model InventorySettings {
  id      String  @id @default("singleton")
  enabled Boolean @default(false)
}
```

The existing `User` model needs these relation fields added:

```prisma
// Add to existing User model:
teamId       String?
team         Team?        @relation("TeamMembers", fields: [teamId], references: [id])
ordersPlaced Order[]      @relation("OrdersPlaced")
toolsRented  ToolRental[] @relation("ToolsRented")
```

---

## Page Routes

All under the existing Next.js app. Auth is already handled by Better Auth middleware -- users must be logged in.

| Route | Description | Auth |
|---|---|---|
| `/inventory` | Browse parts, add to cart, checkout | Logged in, must have team. **Only visible when inventory is enabled (admin toggle) AND user is eligible (bits balance >= `MIN_BITS_FOR_INVENTORY`).** Hidden server-side otherwise. |
| `/inventory/tools` | Browse and rent tools | Logged in, must have team. Same visibility gating as `/inventory`. |
| `/inventory/team` | Create/join/edit/leave team | Logged in |
| `/inventory/dashboard` | Attendee home: active order, active rentals, team, history | Logged in |
| `/inventory/admin` | Admin dashboard: orders, rentals, NFC lookup | ADMIN role |
| `/inventory/admin/items` | Manage inventory: CSV import, add/edit items, DigiKey image search | ADMIN role |
| `/inventory/admin/teams` | View all teams, lock/unlock | ADMIN role |
| `/inventory/admin/settings` | Toggle inventory visibility | ADMIN role |

---

## API Routes

All under `/api/inventory/`. Auth via existing Better Auth session. Admin routes use existing `requireAdmin` / `requirePermission` helpers.

### Items

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/items` | List all items with stock and team's remaining limits |
| `GET` | `/api/inventory/items/:id` | Get single item details |

### Orders

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/orders` | Get current user's team's orders (active + history) |
| `POST` | `/api/inventory/orders` | Place order. Validates: team exists, no active order, stock available, within per-team limits. Decrements stock immediately. Sends Slack DM to all team members. |

### Tool Rentals

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/rentals` | Get current user's team's rentals (active + history) |
| `POST` | `/api/inventory/rentals` | Rent a tool. Validates: team exists, tool available, team has < max concurrent rentals. Sets `dueAt` if time limit configured. Sends Slack DM to all team members. |

### Teams

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/teams` | List all teams (for joining) |
| `POST` | `/api/inventory/teams` | Create team. Validates: unique name, user not already on a team. |
| `GET` | `/api/inventory/teams/:id` | Get team details + members |
| `PATCH` | `/api/inventory/teams/:id` | Edit team name. Validates: not locked. |
| `DELETE` | `/api/inventory/teams/:id` | Delete team. Validates: only one member (the requester). |
| `POST` | `/api/inventory/teams/:id/join` | Join a team. Validates: not locked, not full, user not on another team. |
| `POST` | `/api/inventory/teams/:id/leave` | Leave team. Auto-deletes team if now empty. |
| `POST` | `/api/inventory/teams/:id/members` | Add member by Slack user ID. Validates: not locked, not full. |
| `DELETE` | `/api/inventory/teams/:id/members/:userId` | Remove a member. Validates: not locked. |

### Admin

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/admin/orders` | All orders, filterable by status |
| `PATCH` | `/api/inventory/admin/orders/:id` | Update order status (IN_PROGRESS, READY, COMPLETED). Sends Slack DM on READY and COMPLETED. Logs to AuditLog. |
| `GET` | `/api/inventory/admin/rentals` | All active rentals |
| `PATCH` | `/api/inventory/admin/rentals/:id/return` | Mark tool as returned. Sets `returnedAt`, marks tool available. Sends Slack DM. Logs to AuditLog. |
| `POST` | `/api/inventory/admin/items/import` | CSV upload (bulk import items). Logs to AuditLog. |
| `POST` | `/api/inventory/admin/items` | Add single item. Logs to AuditLog. |
| `PATCH` | `/api/inventory/admin/items/:id` | Edit item. Logs to AuditLog. |
| `DELETE` | `/api/inventory/admin/items/:id` | Delete item. Logs to AuditLog. |
| `GET` | `/api/inventory/admin/teams` | List all teams |
| `PATCH` | `/api/inventory/admin/teams/:id/lock` | Toggle team lock. Logs to AuditLog. |
| `GET` | `/api/inventory/admin/settings` | Get inventory settings (enabled/disabled) |
| `PATCH` | `/api/inventory/admin/settings` | Toggle inventory visibility. Logs to AuditLog. |

### NFC Lookup

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/lookup/:slackUserId` | Given a Slack user ID (from NFC scan), return their team's active order and active rentals |

### DigiKey

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/digikey/search?q=` | Search DigiKey by part name, return list of product images for admin to choose from |

### Real-time

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/inventory/sse?teamId=` | SSE endpoint. Clients subscribe with their team ID. Server pushes order/rental/team status changes. Admin subscribes without team filter for global feed. |

---

## Core Flows

### 1. Ordering

**No pricing. Items are free. No approval step.**

Orders belong to the team. Any team member can place an order and any team member can pick it up. One active order per team at a time.

**Inventory visibility:** Admin can toggle the inventory on/off from `/inventory/admin/settings`. When off, all `/inventory/*` routes are hidden server-side. When on, only eligible users (bits balance >= `MIN_BITS_FOR_INVENTORY`) can see it. Double protection.

**Attendee flow:**
1. Browse items on `/inventory`
2. Select item(s) and quantity (per-team max enforced, shown on part cards)
3. Provide current location: floor dropdown + room/table text field
4. Submit order -- stock decremented immediately
5. All team members get Slack DM

**Order lifecycle:**
1. **PLACED** -- stock updated, team gets Slack DM, SSE event pushed
2. **IN_PROGRESS** -- admin begins preparing, SSE event pushed
3. **READY** -- admin marks ready, team gets Slack DM, SSE event pushed
4. **COMPLETED** -- team member scans badge at hardware station, admin confirms, team gets Slack DM, SSE event pushed

**Admin flow:**
1. View unfulfilled orders on `/inventory/admin`, filterable by status
2. Mark orders as IN_PROGRESS or READY (READY triggers Slack DM)
3. Scan NFC badge or enter Slack user ID to look up team's order at pickup
4. Mark order COMPLETED

### 2. Tool Rental

Tool rentals are per-team. Max concurrent rentals per team is configurable (default: 2).

**Attendee flow:**
1. Browse tools on `/inventory/tools`
2. Select tool, provide location (floor + room/table)
3. Submit -- tool marked unavailable, all team members get Slack DM

**Rental lifecycle:**
1. **CHECKED_OUT** -- tool unavailable, team gets Slack DM, SSE event pushed
2. **Due/overdue** -- if time limits configured, cron job sends Slack reminder to team
3. **RETURNED** -- admin marks returned, tool available again, team gets Slack DM, SSE event pushed

### 3. Teams

- Must be on a team to order or rent
- Create team on `/inventory/team` with a unique name
- Add members by Slack user ID (already on User model)
- Max team size configurable (default: 4)
- Per-team limits do not scale with team size
- All members have equal control (no owner)
- Any member can edit, add/remove members, rename (unless locked)
- Can switch teams at will
- **When a member leaves a team:** active orders and rentals stay with the team. The departing member stops receiving notifications and can no longer pick up orders for that team.
- Solo member can delete team; empty teams auto-delete
- Admins can lock teams to freeze all changes
- All mutations use database transactions to prevent race conditions

### 4. NFC Badge

**Web NFC API for both reading and writing.**

**Badge registration (admin):**
1. Admin enters Slack user ID on `/inventory/admin`
2. Taps NFC tag to device
3. App writes Slack user ID as NDEF text record

**Pickup (admin):**
1. Admin taps "Scan Badge" on `/inventory/admin`
2. Attendee taps badge
3. App reads Slack user ID, calls `GET /api/inventory/lookup/:slackUserId`
4. Displays team's active order and rentals

**Fallback:** Manual Slack user ID text input on admin dashboard.

**Implementation:** Web NFC API. If iOS support is needed, a native app may be required (Web NFC is not supported in Safari).

### 5. Inventory Management

**CSV import:**
- Upload on `/inventory/admin/items`
- Schema defined below; organizers must follow it
- Bulk upserts items

**Single item add/edit:**
- Form on `/inventory/admin/items`
- DigiKey image search: type part name, pick best image from results
- Manual image URL as fallback

**Item fields:** name, description, image URL, stock, category, max per team

### 6. Attendee Dashboard (`/inventory/dashboard`)

- Active order with live status (PLACED / IN_PROGRESS / READY) via SSE
- Active tool rentals with time remaining (if limits set)
- Team info: name, members, edit/leave/switch
- Order history
- Past tool rentals

### 7. Browse / Order Page (`/inventory`)

- Part cards show per-team remaining limit (e.g., "3 of 5 remaining")
- Ordering disabled for items where team has hit max
- One active order per team -- checkout disabled if active order exists
- Cart persisted in client state (not DB)
- **Hidden server-side when inventory is disabled or user is not eligible**

### 8. Admin Dashboard (`/inventory/admin`)

- Unfulfilled orders (chronological), filterable by status
- Active tool rentals (which team, where, since when)
- NFC scan / manual Slack ID lookup
- Team management on `/inventory/admin/teams` (view all, lock/unlock)
- Inventory toggle on `/inventory/admin/settings`

---

## Integration with Existing Systems

### Auth

Uses existing Better Auth. No new auth code. Session cookie `better-auth.session_token` is already set by the main app. All inventory routes just read the session.

### Bits / Currency

Uses existing `CurrencyTransaction` ledger:
- Check user's bits balance against `MIN_BITS_FOR_INVENTORY` to determine eligibility
- Items are free -- no currency transactions created by the inventory system

### Roles

Uses existing `UserRole` system:
- ADMIN role = inventory admin access
- Use existing `requireAdmin` / `requirePermission` helpers from `lib/admin-auth.ts`

### Audit Log

All admin mutations logged to existing `AuditLog` table. Add new action types for inventory operations (e.g., `INVENTORY_ORDER_STATUS_UPDATE`, `INVENTORY_IMPORT`, `INVENTORY_TEAM_LOCK`, etc.).

### Slack

User's `slackId` is already on the `User` model (populated on signup via HCA hook). DMs sent via `@slack/web-api` `chat.postMessage` using the existing bot token.

---

## Slack DMs

No separate service. Push-only via `chat.postMessage` from API routes.

**DM triggers (sent to each team member's `slackId`):**
- Order placed
- Order ready
- Order completed
- Tool checked out
- Tool due/overdue reminder
- Tool returned

**Overdue reminders:** `node-cron` job in the Next.js server process, checks for overdue rentals periodically.

---

## DigiKey Integration

DigiKey Product Information API v4 (free tier). OAuth2 client credentials flow.

**Flow:**
1. Admin types part name into image search on `/inventory/admin/items`
2. Frontend calls `GET /api/inventory/digikey/search?q=<query>`
3. Backend authenticates via client credentials, calls DigiKey keyword search
4. Returns product list with image URLs
5. Admin picks best image
6. URL saved to item record

---

## CSV Import Format

```csv
name,description,category,stock,max_per_team,image_url
"10K Resistor","10K Ohm 1/4W","resistors",500,20,""
"ESP32","ESP32-WROOM-32D","microcontrollers",50,2,""
"Soldering Iron Tip","Fine point replacement tip","accessories",30,5,""
```

- `image_url` is optional (fill later via DigiKey search or manual upload)
- `max_per_team` is required

---

## New Environment Variables

Added to existing `.env`:

| Variable | Description | Default |
|---|---|---|
| `DIGIKEY_CLIENT_ID` | DigiKey API client ID | -- |
| `DIGIKEY_CLIENT_SECRET` | DigiKey API client secret | -- |
| `MIN_BITS_FOR_INVENTORY` | Minimum bits balance to access inventory | -- |
| `VENUE_FLOORS` | Number of floors in venue | `3` |
| `TOOL_RENTAL_TIME_LIMIT_MINUTES` | Tool rental time limit (0 = no limit) | `0` |
| `MAX_TEAM_SIZE` | Max members per team | `4` |
| `MAX_CONCURRENT_RENTALS` | Max active tool rentals per team | `2` |

Slack bot token and DB connection already exist in the Stasis env.
