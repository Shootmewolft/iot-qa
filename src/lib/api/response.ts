import { API_ERRORS, type ApiErrorCode } from "@/lib/api/errors";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
  requestId: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function newRequestId(): string {
  return `req_${crypto.randomUUID().slice(0, 8)}`;
}

export function apiSuccess<T>(data: T, requestId = newRequestId()) {
  return Response.json({ ok: true, data, requestId } satisfies ApiSuccess<T>);
}

export function apiFailure(code: ApiErrorCode, requestId = newRequestId()) {
  const { message, retryable, status } = API_ERRORS[code];

  return Response.json(
    {
      ok: false,
      error: { code, message, retryable },
      requestId,
    } satisfies ApiFailure,
    { status },
  );
}
