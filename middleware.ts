import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://stasis-staging.hackclub-assets.com https://stasis.hackclub-assets.com https://avatars.slack-edge.com https://github.com https://user-images.githubusercontent.com https://private-user-images.githubusercontent.com https://*.s3.amazonaws.com https://blueprint.hackclub.com https://cdn.hackclub.com https://user-cdn.hackclub-assets.com https://*.airtableusercontent.com https://www.freeiconspng.com https://hc-cdn.hel1.your-objectstorage.com https://mm.digikey.com https://files.catbox.moe data: blob:",
    "media-src 'self' https://stasis-staging.hackclub-assets.com https://stasis.hackclub-assets.com blob:",
    "connect-src 'self' https://api2.hackclub.com",
    "font-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.youtube.com https://youtube.com",
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
    const hasSession = request.cookies.has("better-auth.session_token") || request.cookies.has("__Secure-better-auth.session_token");
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

  // Rewrite starter-project subpaths (e.g. /starter-projects/hermes/flightpath)
  // to their static index.html so Next.js doesn't 404
  const starterProjectMatch = request.nextUrl.pathname.match(
    /^\/starter-projects\/(hermes|pathfinder)\/([^.]+?)\/?\s*$/
  );
  if (starterProjectMatch) {
    const [, project, subpath] = starterProjectMatch;
    const url = request.nextUrl.clone();
    url.pathname = `/starter-projects/${project}/${subpath}/index.html`;
    return addSecurityHeaders(NextResponse.rewrite(url));
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/upload).*)"],
};
