// Session gate (system-prompt §7 Phase 5). Optimistic, edge-safe check of the
// BetterAuth session cookie (no DB call here). Real authorization/ownership is
// enforced in route handlers via getCurrentUser(). Protects (app) pages and
// non-public APIs; redirects unauthenticated users to /login.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PAGES = ["/login", "/signup"];

function isPublicPath(pathname: string): boolean {
  // BetterAuth endpoints and public share routes stay open.
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/share")) return true; // public share API (Phase 8)
  if (pathname.startsWith("/s/")) return true; // public share pages (Phase 8)
  return false;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(getSessionCookie(req));

  if (isPublicPath(pathname)) return NextResponse.next();

  // API routes: 401 JSON when unauthenticated (handlers still re-verify).
  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Auth pages: bounce already-signed-in users to the dashboard.
  if (PUBLIC_PAGES.includes(pathname)) {
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Everything else (app pages) requires a session.
  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on all paths except Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
