import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * In Next.js 16 this file is `proxy.ts`, not `middleware.ts`: the convention
 * was renamed and the named export must be `proxy`. Its runtime is Node.js
 * and is not configurable, which is what lets `jose` run here at all.
 *
 * This is an OPTIMISTIC check only. It runs on every request including
 * prefetches, so it does no I/O — just signature and expiry verification of
 * the cookie. Real authorization lives next to the data, in the protected
 * layout and in each Route Handler guard (MVP spec, section 5.4).
 */

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/robots.txt"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isApi = pathname.startsWith("/api/");

  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  if (!session && !isPublic) {
    // An API caller must get a 401, never a redirect to an HTML login page.
    if (isApi) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "SESSION_EXPIRED",
            message: "La sesión expiró. Vuelve a iniciar sesión.",
            retryable: false,
          },
          requestId: `req_${crypto.randomUUID().slice(0, 8)}`,
        },
        { status: 401 },
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (session && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static files. `robots.txt` is
     * intentionally NOT excluded here — it is allowed through PUBLIC_PATHS so
     * that the rule stays visible in one place.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
