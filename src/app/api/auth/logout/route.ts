import { apiSuccess, newRequestId } from "@/lib/api/response";
import { clearSessionCookie } from "@/lib/auth/dal";

/**
 * Logout only drops the cookie. There is no server-side session store to
 * revoke in the MVP, so this is deliberately unguarded: clearing a cookie
 * that may already be invalid must always succeed.
 */
export async function POST() {
  const requestId = newRequestId();
  await clearSessionCookie();
  return apiSuccess({ authenticated: false }, requestId);
}
