import { apiSuccess, newRequestId } from "@/lib/api/response";
import { getSession } from "@/lib/auth/dal";

export async function GET() {
  const requestId = newRequestId();
  const session = await getSession();

  return apiSuccess(
    {
      authenticated: session !== null,
      expiresAt: session ? new Date(session.exp * 1000).toISOString() : null,
    },
    requestId,
  );
}
