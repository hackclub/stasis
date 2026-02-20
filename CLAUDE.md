# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stasis is a hackathon platform (Hack Club) built with Next.js 16 (App Router) + React 19, Prisma 7 + PostgreSQL, Better Auth for OAuth (Hack Club Auth, GitHub, Hackatime), and Tailwind CSS 4. It features project management with design/build review workflows, gamification (XP streaks, badges, currency economy), and integrations with Airtable (RSVPs), AWS S3 (uploads), Slack (profile pictures), and Loops (email).

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
- **API routes**: RESTful under `app/api/` — key domains: `projects`, `discover`, `user`, `admin`, `xp`, `currency`, `upload`, `rsvp`, `badges`
- **Middleware** (`middleware.ts`): Adds security headers (CSP, X-Frame-Options) and optional basic auth for staging

### Auth & Permissions

- **Better Auth** configured in `lib/auth.ts` with three OAuth providers (HCA, Hackatime, GitHub)
- Client-side auth helpers in `lib/auth-client.ts`
- Role-based access: `lib/permissions.ts` (ADMIN, REVIEWER roles)
- Admin route protection: `lib/admin-auth.ts`

### Database

- **Prisma** with `@prisma/adapter-pg` for connection pooling — singleton client in `lib/prisma.ts`
- Schema in `prisma/schema.prisma` — key models: User, Project, WorkSession, ProjectSubmission, BOMItem, UserXP, XPTransaction, UserCurrencyBalance, CurrencyTransaction, UserRole, AuditLog
- Currency operations use Prisma transactions to prevent race conditions (`lib/currency.ts`)

### Key Business Logic (in `lib/`)

- `xp.ts` — XP calculation with day/week streak multipliers
- `currency.ts` — Build hours → currency conversion (10/hr, 10-hour threshold), idempotent awards
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

## TypeScript

Strict mode enabled. Path alias `@/*` maps to project root.
