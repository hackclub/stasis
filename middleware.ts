import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://stasis-staging.hackclub-assets.com https://stasis.hackclub-assets.com https://avatars.slack-edge.com https://github.com https://user-images.githubusercontent.com https://private-user-images.githubusercontent.com https://*.s3.amazonaws.com data: blob:",
    "media-src 'self' https://stasis-staging.hackclub-assets.com https://stasis.hackclub-assets.com blob:",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function addSecurityHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function checkBasicAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const [scheme, encoded] = authHeader.split(" ");
  if (scheme !== "Basic" || !encoded) return false;

  const decoded = atob(encoded);
  const [username, password] = decoded.split(":");
  return (
    username === process.env.BASICAUTH_USERNAME &&
    password === process.env.BASICAUTH_PASSWORD
  );
}

function requireAuth(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Secure Area"',
    },
  });
}

export function middleware(request: NextRequest) {
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
  const isPrelaunch = process.env.NEXT_PUBLIC_PRELAUNCH_MODE === "true";
  const requireSiteAuth = process.env.REQUIRE_BASICAUTH === "true";

  if (requireSiteAuth) {
    if (!checkBasicAuth(request)) return requireAuth();
    return addSecurityHeaders(NextResponse.next());
  }

  if (isPrelaunch && isDashboard && !requireSiteAuth) {
    if (!checkBasicAuth(request)) return requireAuth();
  }

  // Redirect logged-in users from / to /dashboard immediately (no flash)
  if (request.nextUrl.pathname === "/") {
    const hasSession = request.cookies.has("better-auth.session_token");
    if (hasSession) {
      const baseUrl = process.env.BETTER_AUTH_URL;
      if (baseUrl) {
        return addSecurityHeaders(NextResponse.redirect(new URL("/dashboard", baseUrl)));
      }
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return addSecurityHeaders(NextResponse.redirect(url));
    }
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/upload).*)"],
};
