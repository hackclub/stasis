import { NextResponse } from "next/server";
import Airtable from "airtable";
import { requireAdmin } from "@/lib/admin-auth";

const TABLE_ID = process.env.AIRTABLE_YSWS_TABLE_ID || "tblIZNXNzbBac9FvX";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requireAdmin();
  if (authCheck.error) return authCheck.error;

  const { id } = await params;

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    return NextResponse.json({ links: [] });
  }

  const tableName = process.env.AIRTABLE_YSWS_TABLE_NAME || "YSWS Project Submission";
  const escaped = id.replace(/'/g, "\\'");

  try {
    const base = new Airtable({ apiKey }).base(baseId);
    const records = await base(tableName)
      .select({
        filterByFormula: `{Stasis ID} = '${escaped}'`,
        fields: ["Stage"],
        maxRecords: 5,
      })
      .firstPage();

    const links = records.map((r) => ({
      stage: (r.get("Stage") as string) || null,
      url: `https://airtable.com/${baseId}/${TABLE_ID}/${r.id}`,
    }));

    return NextResponse.json({ links });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ links: [], error: message }, { status: 500 });
  }
}
