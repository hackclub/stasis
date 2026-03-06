# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stasis is a hackathon platform (Hack Club) built with Next.js 16 (App Router) + React 19, Prisma 7 + PostgreSQL, Better Auth for OAuth (Hack Club Auth, GitHub, Hackatime), and Tailwind CSS 4. It features project management with design/build review workflows, gamification (badges, currency economy), and integrations with Airtable (RSVPs), AWS S3 (uploads), Slack (profile pictures), and Loops (email).

## Commands

```bash
yarn dev              # Start dev server (or use ./dev.sh to also start local Postgres via Docker)
yarn build            # Production build (standalone output for Docker)
yarn lint             # ESLint
yarn db:studio        # Open Prisma Studio
yarn db:test          # Test database connection
npx prisma generate   # Regenerate Prisma client after schema changes
npx prisma migrate dev # Create/apply migrations
```

Always run `yarn build` after completing any code changes to verify there are no build errors before finishing.

## Architecture

### Routing & API

- **App Router**: All pages under `app/` using Next.js App Router conventions
- **API routes**: RESTful under `app/api/` — key domains: `projects`, `discover`, `user`, `admin`, `currency`, `upload`, `rsvp`, `badges`
- **Middleware** (`middleware.ts`): Adds security headers (CSP, X-Frame-Options) and optional basic auth for staging

### Auth & Permissions

- **Better Auth** configured in `lib/auth.ts` with three OAuth providers (HCA, Hackatime, GitHub)
- Client-side auth helpers in `lib/auth-client.ts`
- Role-based access: `lib/permissions.ts` (ADMIN, REVIEWER roles)
- Admin route protection: `lib/admin-auth.ts`

### Database

- **Prisma** with `@prisma/adapter-pg` for connection pooling — singleton client in `lib/prisma.ts`
- Schema in `prisma/schema.prisma` — key models: User, Project, WorkSession, ProjectSubmission, BOMItem, CurrencyTransaction, UserRole, AuditLog
- Currency ledger is append-only; balance derived from SUM of entries (`lib/currency.ts`)

### Key Business Logic (in `lib/`)

- `currency.ts` — Append-only bits ledger (entries created at build approval based on project tier)
- `tiers.ts` — Five-tier project system (25–400 bits), 350-bit qualification threshold
- `badges.ts` — 16 hardware achievement badge definitions (I2C, SPI, WiFi, CAD, etc.)
- `airtable.ts` — RSVP CRUD and referral tracking
- `audit.ts` — Audit logging for sensitive actions
- `sanitize.ts` — HTML sanitization with DOMPurify

### Project Workflow

Projects go through: Design stage (submit → review → approve/reject) → Build stage (work sessions with time tracking → review → approve). Bill of Materials items have their own review cycle.

### Pre-Launch Mode

When `NEXT_PUBLIC_PRELAUNCH_MODE=true`, the site shows RSVP-only mode with referral tracking and signup counts.

## Environment

Copy `.env.example` for required variables. Key ones: `DATABASE_URL`, `BETTER_AUTH_SECRET`, OAuth client IDs/secrets (HCA, Hackatime, GitHub), `AIRTABLE_API_KEY`, S3 credentials, `SLACK_BOT_TOKEN`.

## Granting Admin Roles Locally

To grant a user the ADMIN role in a local dev database:

```bash
psql "postgresql://postgres:postgres@localhost:5432/stasis" -c "
INSERT INTO user_role (id, \"userId\", role, \"grantedAt\")
SELECT gen_random_uuid()::text, id, 'ADMIN', now()
FROM \"user\"
WHERE email = 'USER_EMAIL_HERE'
AND id NOT IN (SELECT \"userId\" FROM user_role WHERE role = 'ADMIN');
"
```

Note: The `user_role` table uses camelCase column names (`userId`, `grantedAt`) due to Prisma conventions.

## Granting Bits (Currency) Locally

To grant bits to a user in the local dev database:

```bash
psql "postgresql://postgres:postgres@localhost:5432/stasis" -c "
INSERT INTO currency_transaction (id, \"userId\", amount, type, \"balanceBefore\", \"balanceAfter\", note, \"createdAt\")
SELECT
  gen_random_uuid()::text,
  u.id,
  AMOUNT_HERE,
  'ADMIN_GRANT',
  COALESCE((SELECT SUM(amount) FROM currency_transaction WHERE \"userId\" = u.id), 0),
  COALESCE((SELECT SUM(amount) FROM currency_transaction WHERE \"userId\" = u.id), 0) + AMOUNT_HERE,
  'Manual grant via CLI',
  now()
FROM \"user\" u
WHERE u.email = 'USER_EMAIL_HERE';
"
```

Replace `USER_EMAIL_HERE` with the user's email and `AMOUNT_HERE` with the number of bits to grant. The currency ledger is append-only — balance is derived from `SUM(amount)` across all entries for a user.

## Database Migrations

Never AI-generate migration files. Always use `npx prisma migrate dev --name <descriptive_name>` to create migrations — this requires a running database. Always include a descriptive `--name` flag (e.g., `--name add_shop_items_table`) so the migration folder is clearly named. If the database is not available, instruct the user to run the migration themselves.

## TypeScript

Strict mode enabled. Path alias `@/*` maps to project root.
