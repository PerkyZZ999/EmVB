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
