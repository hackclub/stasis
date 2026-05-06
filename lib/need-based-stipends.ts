import Airtable from 'airtable';

// Source of truth for flight stipends, replacing the old per-candidate
// `flightStipendCents` admin override. The "Need Based Stipends" view in the
// prod base is curated by the team there; the attendance dashboard reads it
// instead of letting admins type a number into our DB.
const BASE_ID = 'appRMw1ya4lnaYsGv';
const TABLE_ID = 'tblrekVLXlHMNWH53';
const VIEW_ID = 'viwBFr8SRusYLWCxW';

export interface NeedBasedStipend {
  recordId: string;
  email: string | null;
  slackId: string | null;
  /** Airtable's "Approved amount" (currency, dollars) converted to cents.
   *  null when the field is empty (still in review). */
  approvedAmountCents: number | null;
  status: string | null;
}

export interface StipendLookup {
  byEmail: Map<string, NeedBasedStipend>;
  bySlackId: Map<string, NeedBasedStipend>;
}

let cached: { value: StipendLookup; expiresAt: number } | null = null;
const TTL_MS = 30_000;

export function airtableStipendUrl(recordId?: string | null): string {
  const base = `https://airtable.com/${BASE_ID}/${TABLE_ID}/${VIEW_ID}`;
  return recordId ? `${base}/${recordId}` : base;
}

export async function getNeedBasedStipendLookup(): Promise<StipendLookup | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) return null;

  const base = new Airtable({ apiKey }).base(BASE_ID);
  const records = await base(TABLE_ID).select({ view: VIEW_ID }).all();

  const byEmail = new Map<string, NeedBasedStipend>();
  const bySlackId = new Map<string, NeedBasedStipend>();
  for (const r of records) {
    const email = normalize(r.get('Email'))?.toLowerCase() ?? null;
    const slackId = normalize(r.get('Slack ID')) ?? null;
    const approvedRaw = r.get('Approved amount');
    const approvedAmountCents =
      typeof approvedRaw === 'number' && isFinite(approvedRaw) ? Math.round(approvedRaw * 100) : null;
    const status = normalize(r.get('Stasus')) ?? null;
    const entry: NeedBasedStipend = { recordId: r.id, email, slackId, approvedAmountCents, status };
    if (email) byEmail.set(email, entry);
    if (slackId) bySlackId.set(slackId, entry);
  }
  const value: StipendLookup = { byEmail, bySlackId };
  cached = { value, expiresAt: Date.now() + TTL_MS };
  return value;
}

export function findStipend(
  lookup: StipendLookup | null,
  email: string | null | undefined,
  slackId: string | null | undefined,
): NeedBasedStipend | null {
  if (!lookup) return null;
  if (email) {
    const hit = lookup.byEmail.get(email.trim().toLowerCase());
    if (hit) return hit;
  }
  if (slackId) {
    const hit = lookup.bySlackId.get(slackId.trim());
    if (hit) return hit;
  }
  return null;
}

function normalize(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
