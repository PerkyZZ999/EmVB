import { apiFetch } from "emdash/plugin-utils";

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** `apiFetch` adds the `X-EmDash-Request` header private EmDash routes require (CSRF guard). */
export const defaultFetcher: Fetcher = (path, init) => apiFetch(path, init);

export async function requestJson<T>(
  fetcher: Fetcher,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetcher(path, {
    method: init?.method ?? "GET",
    ...(init?.body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? "HTTP_ERROR",
      payload.error?.message ?? response.statusText,
    );
  }
  return payload.data as T;
}
