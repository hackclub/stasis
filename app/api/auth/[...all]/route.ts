import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest, NextResponse } from "next/server";

const { GET: authGET, POST } = toNextJsHandler(auth);

async function GET(request: NextRequest) {
  const response = await authGET(request);

  // If Better Auth redirects to its error page due to a consumed state token
  // (duplicate callback from browser), redirect to dashboard instead.
  const location = response.headers.get("location");
  if (location?.includes("/api/auth/error")) {
    const baseUrl = process.env.BETTER_AUTH_URL || request.url;
    return NextResponse.redirect(new URL("/dashboard", baseUrl));
  }

  return response;
}

export { GET, POST };
