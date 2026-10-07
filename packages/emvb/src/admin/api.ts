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

const LIST_PAGE = 50;
/** Enough for any real site (1000 entries); stops a cursor that never ends. */
const LIST_MAX_PAGES = 20;

/**
 * Every entry of a content list, newest first, page by page (W-204): one request used to stop at
 * the 50 most recently updated, so older pages and parts never showed in the lists.
 */
export async function listAllItems<T>(fetcher: Fetcher, collectionPath: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const query = `?limit=${LIST_PAGE}&orderBy=updatedAt&order=desc${
      cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
    }`;
    // oxlint-disable-next-line no-await-in-loop -- each page needs the previous page's cursor
    const body = await requestJson<{ items?: T[]; nextCursor?: string }>(
      fetcher,
      `${collectionPath}${query}`,
    );
    items.push(...(body?.items ?? []));
    cursor = body?.nextCursor || undefined;
    if (!cursor) break;
  }
  return items;
}
