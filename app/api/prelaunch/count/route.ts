import { NextResponse } from "next/server";
import { getRSVPCount, getRSVPCountLast24Hours } from "@/lib/airtable";
import prisma from "@/lib/prisma";

const CACHE_TTL_MS = 60 * 1000; // 1 minute

let cachedCount: number | null = null;
let cachedRecentCount: number | null = null;
let cacheTimestamp: number = 0;

export async function GET() {
  try {
    const now = Date.now();
    
    if (cachedCount !== null && now - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { count: cachedCount, recentCount: cachedRecentCount ?? 0 },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    // When using Postgres fallback, use the last cached Airtable value if available,
    // otherwise fall back to counting temp RSVPs in Postgres.
    if (process.env.RSVP_USE_POSTGRES === "true") {
      if (cachedCount !== null) {
        return NextResponse.json(
          { count: cachedCount, recentCount: cachedRecentCount ?? 0 },
          {
            headers: {
              "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
            },
          }
        );
      }
      const AIRTABLE_BASELINE = 441;
      const pgCount = await prisma.tempRsvp.count();
      return NextResponse.json({ count: AIRTABLE_BASELINE + pgCount, recentCount: 0 });
    }

    const [count, recentCount] = await Promise.all([
      getRSVPCount(),
      getRSVPCountLast24Hours(),
    ]);
    cachedCount = count;
    cachedRecentCount = recentCount;
    cacheTimestamp = now;

    return NextResponse.json(
      { count, recentCount },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // Return cached value if available, even if stale
    if (cachedCount !== null) {
      return NextResponse.json({ count: cachedCount, recentCount: cachedRecentCount ?? 0 });
    }
    
    return NextResponse.json(
      { error: "Failed to get count" },
      { status: 500 }
    );
  }
}
