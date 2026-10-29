import { PAGES_COLLECTION } from "../../constants.ts";
import { validateLayout, type Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";

/** The id the editor loads in field mode; it never exists on the server. */
export const FIELD_ENTRY_ID = "emvb-field";

const ENTRY_PATH = `/_emdash/api/content/${PAGES_COLLECTION}/${FIELD_ENTRY_ID}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A stored field value (object or JSON string) as a layout, or null when unreadable. */
export function readFieldLayout(value: unknown): Layout | null {
  let parsed = value;
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (parsed === null || parsed === undefined) return null;
  const result = validateLayout(parsed);
  return result.ok ? result.layout : null;
}

/**
 * Field mode (W-900): the editor talks to a virtual draft entry held in memory, so Save draft
 * stages the layout here instead of writing an EmVB page. Design, media and plugin routes go to
 * the real server. `saved()` is the last staged layout, or undefined when nothing was saved.
 */
export function createFieldFetcher(
  base: Fetcher,
  initial: { title: string; layout: Layout | null },
): { fetcher: Fetcher; saved: () => Layout | null | undefined } {
  let layout = initial.layout;
  let staged: Layout | null | undefined;
  let rev = 1;
  const fetcher: Fetcher = async (path, init) => {
    if (path !== ENTRY_PATH && !path.startsWith(`${ENTRY_PATH}/`)) return base(path, init);
    const method = (init?.method ?? "GET").toUpperCase();
    if (path === ENTRY_PATH && method === "GET") {
      return json(200, {
        data: {
          item: {
            id: FIELD_ENTRY_ID,
            slug: "",
            status: "draft",
            draftRevisionId: null,
            data: { title: initial.title, layout, canvas_mode: "site-layout" },
          },
          _rev: String(rev),
        },
      });
    }
    if (path === ENTRY_PATH && method === "PUT") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
        data?: { layout?: unknown };
      };
      if (body.data && "layout" in body.data) {
        // Every layout string is untrusted, including the editor's own.
        const result = validateLayout(body.data.layout);
        if (!result.ok) {
          return json(400, { error: { code: "INVALID_LAYOUT", message: "Invalid layout." } });
        }
        layout = result.layout;
        staged = layout;
      }
      rev += 1;
      return json(200, { data: { _rev: String(rev) } });
    }
    return json(400, {
      error: { code: "FIELD_MODE", message: "This isn't available while editing a field." },
    });
  };
  return { fetcher, saved: () => staged };
}
