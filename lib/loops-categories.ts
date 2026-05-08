import Airtable from 'airtable';
import prisma from './prisma';

type AirtableBase = ReturnType<Airtable['base']>;
type AirtableFieldSet = Airtable.FieldSet;
type AirtableRecords = Airtable.Records<AirtableFieldSet>;

// New "Loops Categories" table on the Stasis Airtable base. The external sync
// system reads this table to bucket users into Loops audience groups.
const TABLE_NAME = 'Loops Categories';
const FIELD_EMAIL = 'email';
const FIELD_IS_GIRL_REACHED_OUT = 'Loops - stasisIsGirlReachedOut';

const TAG_YES = '1';
const TAG_EMPTY = '';

/**
 * For each candidate in /admin/attendance, decide what value
 * `Loops - stasisIsGirlReachedOut` should hold:
 *   - "1" when the candidate is marked isGirl AND outreachStatus = CONTACTED
 *   - ""  otherwise (still imported so the row exists for other future tags)
 *
 * Emails are normalized to lowercase. Candidates without any usable email are
 * skipped entirely.
 */
async function buildDesiredCategoryMap(): Promise<Map<string, { email: string; value: string }>> {
  const candidates = await prisma.attendanceCandidate.findMany({
    select: {
      externalEmail: true,
      isGirl: true,
      outreachStatus: true,
      user: { select: { email: true } },
    },
  });

  const desired = new Map<string, { email: string; value: string }>();
  for (const c of candidates) {
    const rawEmail = c.user?.email ?? c.externalEmail ?? null;
    if (!rawEmail) continue;
    const trimmed = rawEmail.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const value = c.isGirl === true && c.outreachStatus === 'CONTACTED' ? TAG_YES : TAG_EMPTY;
    // Last write wins; if the same email shows up twice (shouldn't happen),
    // prefer the YES value so we never silently downgrade a tag.
    const existing = desired.get(key);
    if (!existing || (existing.value !== TAG_YES && value === TAG_YES)) {
      desired.set(key, { email: trimmed, value });
    }
  }
  return desired;
}

interface ExistingRow {
  id: string;
  email: string;
  value: string;
}

async function fetchAllExistingRows(
  base: AirtableBase,
): Promise<Map<string, ExistingRow>> {
  const byEmail = new Map<string, ExistingRow>();
  await base(TABLE_NAME)
    .select({ fields: [FIELD_EMAIL, FIELD_IS_GIRL_REACHED_OUT], pageSize: 100 })
    .eachPage((records: AirtableRecords, fetchNextPage: () => void) => {
      for (const r of records) {
        const email = (r.get(FIELD_EMAIL) as string | undefined) ?? '';
        if (!email) continue;
        const value = (r.get(FIELD_IS_GIRL_REACHED_OUT) as string | undefined) ?? '';
        byEmail.set(email.trim().toLowerCase(), { id: r.id, email, value });
      }
      fetchNextPage();
    });
  return byEmail;
}

// Dev PATs typically lack write scope on the prod base — recognise the 403
// and surface it as a clean "skipped, no write access" rather than an error.
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /NOT_AUTHORIZED|INVALID_PERMISSIONS|UNAUTHORIZED|\b403\b/i.test(msg);
}

async function batchCreate(
  base: AirtableBase,
  rows: Array<{ email: string; value: string }>,
): Promise<{ created: number; errors: string[]; noWriteAccess: boolean }> {
  if (rows.length === 0) return { created: 0, errors: [], noWriteAccess: false };
  const errors: string[] = [];
  let created = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    try {
      await base(TABLE_NAME).create(
        chunk.map((r) => ({
          fields: { [FIELD_EMAIL]: r.email, [FIELD_IS_GIRL_REACHED_OUT]: r.value },
        })),
      );
      created += chunk.length;
    } catch (err) {
      if (isAuthError(err)) return { created, errors, noWriteAccess: true };
      errors.push(`create chunk ${i / 10}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { created, errors, noWriteAccess: false };
}

async function batchUpdate(
  base: AirtableBase,
  rows: Array<{ id: string; value: string }>,
): Promise<{ updated: number; errors: string[]; noWriteAccess: boolean }> {
  if (rows.length === 0) return { updated: 0, errors: [], noWriteAccess: false };
  const errors: string[] = [];
  let updated = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const chunk = rows.slice(i, i + 10);
    try {
      await base(TABLE_NAME).update(
        chunk.map((r) => ({
          id: r.id,
          fields: { [FIELD_IS_GIRL_REACHED_OUT]: r.value },
        })),
      );
      updated += chunk.length;
    } catch (err) {
      if (isAuthError(err)) return { updated, errors, noWriteAccess: true };
      errors.push(`update chunk ${i / 10}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { updated, errors, noWriteAccess: false };
}

export interface LoopsCategoriesSyncResult {
  scanned: number;        // candidates considered
  created: number;        // new rows added to Airtable
  updated: number;        // existing rows whose tag value changed
  unchanged: number;      // existing rows already matching desired value
  girlsReachedOut: number; // total candidates tagged YES this run
  /** True when the Airtable PAT lacks write scope on this base. Expected on
   *  dev — the prod PAT has write access, dev PATs usually don't. The sync
   *  short-circuits without raising an error so the dev UI doesn't look broken. */
  skippedNoWriteAccess: boolean;
  errors: string[];
}

/**
 * Idempotent: safe to run on a cron. Never deletes existing rows — only
 * creates missing ones and updates the tag value when it differs.
 */
export async function syncLoopsCategories(): Promise<LoopsCategoriesSyncResult> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error('Airtable credentials not configured (AIRTABLE_API_KEY / AIRTABLE_BASE_ID)');
  }
  const base = new Airtable({ apiKey }).base(baseId);

  const [desired, existing] = await Promise.all([
    buildDesiredCategoryMap(),
    fetchAllExistingRows(base),
  ]);

  const toCreate: Array<{ email: string; value: string }> = [];
  const toUpdate: Array<{ id: string; value: string }> = [];
  let unchanged = 0;
  let girlsReachedOut = 0;

  for (const [key, { email, value }] of desired) {
    if (value === TAG_YES) girlsReachedOut += 1;
    const ex = existing.get(key);
    if (!ex) {
      toCreate.push({ email, value });
    } else if ((ex.value ?? '') !== value) {
      toUpdate.push({ id: ex.id, value });
    } else {
      unchanged += 1;
    }
  }

  const errors: string[] = [];
  const createResult = await batchCreate(base, toCreate);
  errors.push(...createResult.errors);
  // If creates hit a 403, updates will too — skip them and surface a single
  // clean "no write access" signal instead of a wall of duplicate errors.
  const updateResult = createResult.noWriteAccess
    ? { updated: 0, errors: [], noWriteAccess: true }
    : await batchUpdate(base, toUpdate);
  errors.push(...updateResult.errors);

  return {
    scanned: desired.size,
    skippedNoWriteAccess: createResult.noWriteAccess || updateResult.noWriteAccess,
    created: createResult.created,
    updated: updateResult.updated,
    unchanged,
    girlsReachedOut,
    errors,
  };
}
