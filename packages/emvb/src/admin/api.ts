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

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

/** The JSON envelope of an EmDash API response, or `{}` when the body isn't JSON. */
export async function readEnvelope<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json().catch(() => ({}))) as Envelope<T>;
}

/** The ApiError for a failed response, from its envelope's code and message when present. */
export const envelopeError = (response: Response, envelope: Envelope<unknown>) =>
  new ApiError(
    response.status,
    envelope.error?.code ?? "HTTP_ERROR",
    envelope.error?.message ?? response.statusText,
  );

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
  const payload = await readEnvelope<T>(response);
  if (!response.ok) throw envelopeError(response, payload);
  return payload.data as T;
}
