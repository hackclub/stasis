# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stasis is a hackathon platform (Hack Club) built with Next.js 16 (App Router) + React 19, Prisma 7 + PostgreSQL, Better Auth for OAuth (Hack Club Auth, GitHub, Hackatime), and Tailwind CSS 4. It features project management with design/build review workflows, gamification (badges, currency economy), and integrations with Airtable (RSVPs), AWS S3 (uploads), Slack (profile pictures), and Loops (email).

## Commands

Package manager: **yarn**. Local dev: `./dev.sh` (starts Postgres in Docker + dev server). Always run `yarn build` after code changes to verify no build errors. No test framework configured. Playwright screenshots go in `/tmp`.

## Architecture

### Structure

- **Components**: Live under `app/components/`, not a top-level `components/` directory
- **Sentry**: Configured in `instrumentation.ts`; production builds include Sentry plugin, local builds skip it

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
- `pii.ts` — AES-256-GCM encryption/decryption for User PII fields (address, birthday)

### Project Workflow

Projects go through: Design stage (submit → review → approve/reject) → Build stage (work sessions with time tracking → review → approve). Bill of Materials items have their own review cycle. Submissions use a `ReviewClaim` lock with expiry to prevent concurrent reviews.

### Pre-Launch Mode

When `NEXT_PUBLIC_PRELAUNCH_MODE=true`, the site shows RSVP-only mode with referral tracking and signup counts.

## Environment

Copy `.env.example` for required variables. Key ones: `DATABASE_URL`, `BETTER_AUTH_SECRET`, OAuth client IDs/secrets (HCA, Hackatime, GitHub), `AIRTABLE_API_KEY`, S3 credentials, `SLACK_BOT_TOKEN`.

- `READONLY_PRODUCTION_DATABASE_URL` (already exported to Claude's shell via `.claude/settings.local.json`): read-only prod replica. Use it for real user/project/streak/currency questions — local DB is usually empty. Safe to query freely, never write. Retry once on "Connection refused".

## Looking Up a User by Slack ID

Slack profile URLs look like `https://hackclub.enterprise.slack.com/team/U0A2SJ7B739` — the `U…` segment is `user.slackId` in our DB. To resolve and inspect a user (including Tamagotchi streak state) in one round trip against the prod read replica:

```bash
psql "$READONLY_PRODUCTION_DATABASE_URL" <<'SQL'
WITH u AS (SELECT id, email, name FROM "user" WHERE "slackId" = 'U0A2SJ7B739')
SELECT ws.id, ws."createdAt", ws."effectiveDate",
       (ws.content IS NOT NULL AND TRIM(ws.content) <> '') AS has_journal
FROM work_session ws
JOIN project p ON p.id = ws."projectId"
JOIN u ON u.id = p."userId"
WHERE p."deletedAt" IS NULL
  AND ws."createdAt" >= '2026-03-26'  -- a day before TAMAGOTCHI_EVENT.START
  AND ws."createdAt" <  '2026-04-15'  -- a day after TAMAGOTCHI_EVENT.END
ORDER BY ws."createdAt";

SELECT date, "grantedAt"
FROM streak_grace_day
WHERE "userId" IN (SELECT id FROM "user" WHERE "slackId" = 'U0A2SJ7B739')
ORDER BY date;
SQL
```

Notes:
- A day "counts" toward the Tamagotchi streak when it has at least one work session whose `content` is non-empty (the journal entry — see `app/api/tamagotchi/status/route.ts`).
- **Do NOT filter on `effectiveDate` directly.** That column was added partway through the event, so older sessions have `effectiveDate IS NULL` and the API falls back to computing the date from `createdAt` + the viewer's TZ (`app/api/tamagotchi/status/route.ts:88`, `lib/tamagotchi.ts` `getEffectiveDate`). Filtering on `effectiveDate BETWEEN ...` will silently drop those sessions and undercount the user's real activity. Always filter on `createdAt` and bucket the rows in your head (or in a CASE) using `effectiveDate` when present, otherwise the user's TZ applied to `createdAt`.
- The event date range (`2026-03-27`–`2026-04-13`) is hard-coded in `lib/tamagotchi.ts` (`TAMAGOTCHI_EVENT.START` / `END`); update the SQL above if those constants change. Pad the `createdAt` window by ±1 day to catch sessions whose effective date falls in-window after the 30-min post-midnight grace.
- There is no `timezone` column on `user`. If you need to bucket NULL-`effectiveDate` rows precisely, ask the user what TZ the person is in (or check whether the rows are far enough from midnight UTC that the answer is unambiguous under any plausible TZ).
- Grace days are stored in `streak_grace_day` and are granted via `POST /api/admin/tamagotchi/grace-day` (`app/api/admin/tamagotchi/grace-day/route.ts`); there is no admin UI for it.

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

## Code style

- Use `Readonly<>` for component prop types
- Sanitize user input in API routes: `sanitize(body.x)` for plain text, `sanitizeHtml(body.x)` for HTML (both from `@/lib/sanitize`)
