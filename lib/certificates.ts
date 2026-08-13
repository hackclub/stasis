import Airtable from 'airtable';

/**
 * Certificate verification lookups.
 *
 * Issued certificates live in the "Certificates & Emails" table alongside the
 * recipient's name and the PDF that was sent to them, so verification reads
 * from the same row the certificate was generated from rather than a second
 * copy of the truth. The table is tiny (one row per recipient), so the whole
 * thing is pulled and cached instead of querying per code.
 */

const CERTIFICATES_TABLE = 'Certificates & Emails';
const CODE_FIELD = 'certificate_id';
const CACHE_TTL_MS = 60_000;

export interface IssuedCertificate {
  code: string;
  name: string;
  issuedAt: string | null;
}

interface Cache {
  fetchedAt: number;
  byCode: Map<string, IssuedCertificate>;
}

let cache: Cache | null = null;

/** Codes are printed in caps and typed back in by hand — accept any casing or stray separators. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getBase() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  // Issued certificates only ever live in the production base, so this lookup
  // can be pointed there independently of AIRTABLE_BASE_ID. That lets local dev
  // resolve real certificate IDs (this path is read-only) while every other
  // Airtable call — RSVP writes included — stays on the dev base. Unset in
  // production, where AIRTABLE_BASE_ID is already the right base.
  const baseId = process.env.CERTIFICATES_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return null;
  return new Airtable({ apiKey }).base(baseId);
}

async function loadCertificates(): Promise<Map<string, IssuedCertificate>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.byCode;
  }

  const base = getBase();
  if (!base) return new Map();

  const byCode = new Map<string, IssuedCertificate>();
  const records = await base(CERTIFICATES_TABLE)
    .select({ fields: [CODE_FIELD, 'first_name', 'last_name'] })
    .all();

  for (const record of records) {
    const raw = record.get(CODE_FIELD);
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const code = normalizeCode(raw);
    const first = (record.get('first_name') as string | undefined)?.trim() ?? '';
    const last = (record.get('last_name') as string | undefined)?.trim() ?? '';
    const name = [first, last].filter(Boolean).join(' ');
    if (!name) continue;
    byCode.set(code, {
      code,
      name,
      issuedAt: record._rawJson?.createdTime ?? null,
    });
  }

  cache = { fetchedAt: Date.now(), byCode };
  return byCode;
}

export async function findCertificate(input: string): Promise<IssuedCertificate | null> {
  const code = normalizeCode(input);
  if (!code) return null;
  const byCode = await loadCertificates();
  return byCode.get(code) ?? null;
}
