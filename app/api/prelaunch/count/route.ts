import { NextResponse } from "next/server";
import { getRSVPCount } from "@/lib/airtable";

const CACHE_TTL_MS = 60 * 1000; // 1 minute

let cachedCount: number | null = null;
let cacheTimestamp: number = 0;

export async function GET() {
  try {
    const now = Date.now();
    
    if (cachedCount !== null && now - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json(
        { count: cachedCount },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    const count = await getRSVPCount();
    cachedCount = count;
    cacheTimestamp = now;

    return NextResponse.json(
      { count },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    // Return cached value if available, even if stale
    if (cachedCount !== null) {
      return NextResponse.json({ count: cachedCount });
    }
    
    return NextResponse.json(
      { error: "Failed to get count" },
      { status: 500 }
    );
  }
}
