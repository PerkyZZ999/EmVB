import { describe, expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { loadFormFields, loadFormsCapability } from "./forms-api.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("loadFormsCapability (W-036)", () => {
  test("ready when forms/list returns items", async () => {
    const fetcher: Fetcher = async () =>
      json(200, { data: { items: [{ id: "01FORM", name: "Contact", slug: "contact" }] } });
    await expect(loadFormsCapability(fetcher)).resolves.toEqual({
      status: "ready",
      canList: true,
      forms: [{ id: "01FORM", name: "Contact", slug: "contact" }],
    });
  });

  test("manual when forms/list is forbidden", async () => {
    const fetcher: Fetcher = async () => json(403, { error: { code: "FORBIDDEN", message: "no" } });
    await expect(loadFormsCapability(fetcher)).resolves.toEqual({
      status: "manual",
      canList: false,
    });
  });

  test("missing when list and definition both fail hard", async () => {
    const hard: Fetcher = async () => json(502, { error: { code: "UPSTREAM", message: "boom" } });
    await expect(loadFormsCapability(hard)).resolves.toEqual({ status: "missing" });
  });

  // Recorded before W-086 M14 split the probe out: every list answer against every probe answer.
  test("each list and definition answer maps to the same capability and requests", async () => {
    const offline = () => Promise.reject(new TypeError("Failed to fetch"));
    const lists: Record<string, () => Response | Promise<Response>> = {
      items: () => json(200, { data: { items: [{ id: "f1", name: "A", slug: "a", extra: 1 }] } }),
      noItems: () => json(200, { data: {} }),
      noData: () => json(200, {}),
      unauthorized: () => json(401, { error: { code: "UNAUTHORIZED", message: "no" } }),
      forbidden: () => json(403, { error: { code: "FORBIDDEN", message: "no" } }),
      notFound: () => json(404, { error: { code: "NOT_FOUND", message: "Not found" } }),
      broken: () => json(500, { error: { code: "BOOM", message: "boom" } }),
      offline,
    };
    const probes: Record<string, () => Response | Promise<Response>> = {
      ok: () => json(200, { data: { pages: [] } }),
      notFoundCode: () => json(404, { error: { code: "NOT_FOUND", message: "nope" } }),
      formMessage: () => json(404, { error: { code: "MISSING", message: "Form does not exist" } }),
      bare404: () => json(404, { error: { code: "MISSING", message: "nope" } }),
      gone: () => json(410, { error: { code: "GONE", message: "gone" } }),
      invalid: () => json(422, { error: { code: "INVALID", message: "bad" } }),
      broken: () => json(500, { error: { code: "BOOM", message: "boom" } }),
      offline,
    };
    const cases = Object.entries(lists).flatMap(([listName, list]) =>
      Object.entries(probes).map(async ([probeName, probe]) => {
        const sent: string[] = [];
        const fetcher: Fetcher = async (path, init) => {
          sent.push(`${init?.method} ${path} ${String(init?.body)}`);
          return path.endsWith("/forms/list") ? list() : probe();
        };
        const capability = await loadFormsCapability(fetcher);
        return [`${listName} × ${probeName}`, { capability, sent }] as const;
      }),
    );
    const results = Object.fromEntries(await Promise.all(cases));
    expect(results).toMatchSnapshot();
  });
});

describe("loadFormFields (W-036)", () => {
  test("flattens definition pages into fields", async () => {
    const fetcher: Fetcher = async () =>
      json(200, {
        data: {
          pages: [
            {
              fields: [
                { name: "email", type: "email", label: "Email", required: true },
                { name: "note", type: "textarea", label: "Note", required: false },
              ],
            },
          ],
        },
      });
    await expect(loadFormFields(fetcher, "01FORM")).resolves.toEqual([
      { name: "email", type: "email", label: "Email", required: true },
      { name: "note", type: "textarea", label: "Note", required: false },
    ]);
  });

  test("returns null when definition is unavailable", async () => {
    const fetcher: Fetcher = async () => json(404, { error: { code: "NOT_FOUND", message: "no" } });
    await expect(loadFormFields(fetcher, "missing")).resolves.toBeNull();
    await expect(loadFormFields(fetcher, "")).resolves.toBeNull();
  });
});
