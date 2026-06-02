#!/usr/bin/env bun

import { config } from "dotenv";
config();

const STASIS_API_KEY = process.env.AIRTABLE_API_KEY!;
const STASIS_BASE_ID = process.env.STASIS_PROD_AIRTABLE_BASE_ID!;
const UNIFIED_API_KEY = process.env.UNIFIED_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY!;
const UNIFIED_BASE_ID = process.env.UNIFIED_AIRTABLE_BASE_ID!;
const STASIS_PROGRAM_ID = "reccJObdSfrV9CTi8";
const STASIS_TABLE_ID = "tblIZNXNzbBac9FvX";

function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  let u = url.trim().toLowerCase();
  u = u.replace(/\/+$/, "");
  u = u.replace(/\.git$/, "");
  u = u.replace(/^http:\/\//, "https://");
  // Normalize github URLs to repo root (strip /tree/..., /blob/..., /commit/...)
  u = u.replace(
    /^(https:\/\/github\.com\/[^/]+\/[^/]+)\/(tree|blob|commit|releases|issues|pull)\/.*/,
    "$1"
  );
  return u;
}

let requestQueue = Promise.resolve();
let requestCount = 0;
const RATE_LIMIT_PER_SEC = 4; // stay under Airtable's 5/s

async function rateLimitedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return new Promise((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      requestCount++;
      if (requestCount % RATE_LIMIT_PER_SEC === 0) {
        await new Promise((r) => setTimeout(r, 1050));
      }
      try {
        const res = await fetch(url, options);
        resolve(res);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function airtableFetch(
  baseId: string,
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `https://api.airtable.com/v0/${baseId}/${path}`;
  const res = await rateLimitedFetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body}`);
  }
  return res.json();
}

interface AirtableRecord {
  id: string;
  fields: Record<string, any>;
}

async function fetchAllRecords(
  baseId: string,
  apiKey: string,
  tableId: string,
  params: { fields?: string[]; filterByFormula?: string } = {}
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  do {
    const qp = new URLSearchParams();
    if (params.fields)
      params.fields.forEach((f) => qp.append("fields[]", f));
    if (params.filterByFormula)
      qp.set("filterByFormula", params.filterByFormula);
    if (offset) qp.set("offset", offset);
    qp.set("pageSize", "100");

    const data = await airtableFetch(baseId, apiKey, `${tableId}?${qp}`);
    records.push(...data.records);
    offset = data.offset;
    process.stdout.write(`\r  Fetched ${records.length} records...`);
  } while (offset);
  console.log();
  return records;
}

async function main() {
  const dryRun = !process.argv.includes("--apply");
  if (dryRun) {
    console.log("DRY RUN — pass --apply to write to Airtable\n");
  }

  // 1. Discover unified DB table ID for "Approved Projects"
  console.log("Looking up unified DB table ID...");
  const metaRes = await rateLimitedFetch(
    `https://api.airtable.com/v0/meta/bases/${UNIFIED_BASE_ID}/tables`,
    { headers: { Authorization: `Bearer ${UNIFIED_API_KEY}` } }
  );
  const meta = await metaRes.json();
  const approvedTable = (meta as any).tables?.find(
    (t: any) => t.name === "Approved Projects"
  );
  if (!approvedTable) throw new Error("Could not find Approved Projects table");
  const unifiedTableId = approvedTable.id;
  console.log(`  Approved Projects table: ${unifiedTableId}`);

  // 2. Fetch pending (unsubmitted) Stasis submissions
  console.log("\nFetching pending Stasis submissions...");
  const submissions = await fetchAllRecords(
    STASIS_BASE_ID,
    STASIS_API_KEY,
    STASIS_TABLE_ID,
    {
      fields: ["Code URL", "Duplicate Code URL in Unified DB"],
      filterByFormula: "{Automation - Status} = '1–Pending Submission'",
    }
  );

  // Build map: normalized URL -> submission records
  const stasisUrlMap = new Map<string, AirtableRecord[]>();
  let skippedNoUrl = 0;
  let skippedAlreadySet = 0;
  for (const rec of submissions) {
    const codeUrl = rec.fields["Code URL"];
    const existing = rec.fields["Duplicate Code URL in Unified DB"];
    if (existing) {
      skippedAlreadySet++;
      continue;
    }
    const norm = normalizeUrl(codeUrl);
    if (!norm) {
      skippedNoUrl++;
      continue;
    }
    if (!stasisUrlMap.has(norm)) stasisUrlMap.set(norm, []);
    stasisUrlMap.get(norm)!.push(rec);
  }
  console.log(
    `  ${submissions.length} total, ${stasisUrlMap.size} unique URLs to check (${skippedNoUrl} no URL, ${skippedAlreadySet} already checked)`
  );

  // 3. For each unique Stasis code URL, search the unified DB for a non-Stasis match
  console.log("\nSearching unified DB for duplicate URLs...");
  const updates: { stasisId: string; link: string; url: string }[] = [];
  let checked = 0;
  for (const [normUrl, stasisRecs] of stasisUrlMap) {
    checked++;
    if (checked % 25 === 0)
      console.log(`  Checked ${checked}/${stasisUrlMap.size}...`);

    const escapedUrl = normUrl.replace(/'/g, "\\'");
    const formula = `AND({Code URL} = '${escapedUrl}', NOT(FIND('${STASIS_PROGRAM_ID}', ARRAYJOIN({YSWS}))))`;
    const qp = new URLSearchParams();
    qp.set("filterByFormula", formula);
    qp.append("fields[]", "Code URL");
    qp.set("pageSize", "1");

    try {
      const data = await airtableFetch(
        UNIFIED_BASE_ID,
        UNIFIED_API_KEY,
        `${unifiedTableId}?${qp}`
      );
      if (data.records.length > 0) {
        const matchId = data.records[0].id;
        const link = `https://airtable.com/${UNIFIED_BASE_ID}/${unifiedTableId}/${matchId}`;
        for (const sub of stasisRecs) {
          updates.push({ stasisId: sub.id, link, url: normUrl });
        }
        console.log(`  DUPLICATE: ${normUrl} -> ${matchId}`);
      }
    } catch (e: any) {
      console.error(`  Error checking ${normUrl}: ${e.message}`);
    }
  }
  console.log(`  Checked ${checked}/${stasisUrlMap.size}`)

  console.log(`\nFound ${updates.length} submissions with duplicate code URLs:`);
  for (const u of updates) {
    console.log(`  ${u.stasisId}: ${u.url}`);
    console.log(`    -> ${u.link}`);
  }

  if (updates.length === 0) {
    console.log("\nNo duplicates found.");
    return;
  }

  if (dryRun) {
    console.log(
      `\nDry run complete. Run with --apply to update ${updates.length} records.`
    );
    return;
  }

  // 5. Batch update Stasis records (10 per request, Airtable limit)
  console.log(`\nUpdating ${updates.length} Stasis records...`);
  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    await airtableFetch(STASIS_BASE_ID, STASIS_API_KEY, STASIS_TABLE_ID, {
      method: "PATCH",
      body: JSON.stringify({
        records: batch.map((u) => ({
          id: u.stasisId,
          fields: { "Duplicate Code URL in Unified DB": u.link },
        })),
      }),
    });
    console.log(
      `  Updated ${Math.min(i + 10, updates.length)}/${updates.length}`
    );
  }

  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
