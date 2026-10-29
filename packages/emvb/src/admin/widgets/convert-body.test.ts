import { describe, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import { convertEntryBody, hostEntryFromLocation } from "./convert-body.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });

function fake(
  content: Record<string, unknown>,
  fields = [{ slug: "content", type: "portableText" }],
) {
  const calls: { path: string; method: string }[] = [];
  const fetcher: Fetcher = async (path, init) => {
    calls.push({ path, method: init?.method ?? "GET" });
    if (path.startsWith("/_emdash/api/schema/")) return json({ item: { slug: "pages", fields } });
    return json({ item: { data: content } });
  };
  return { fetcher, calls };
}

describe("Convert to EmVB (W-912)", () => {
  test("W-912: finds the host entry in the admin URL", () => {
    expect(hostEntryFromLocation("/_emdash/admin/content/pages/01ABC")).toEqual({
      collection: "pages",
      id: "01ABC",
    });
    expect(hostEntryFromLocation("/_emdash/admin/content/pages/new")).toBeUndefined();
    expect(hostEntryFromLocation("/_emdash/admin/content/..%2Fx/1")).toBeUndefined();
  });

  test("W-912: converts the saved body with GET requests only", async () => {
    const body = [{ _type: "block", style: "normal", children: [{ text: "Hello" }] }];
    const { fetcher, calls } = fake({ title: "About", content: JSON.stringify(body) });
    const result = await convertEntryBody(fetcher, { collection: "pages", id: "01ABC" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layout.root.children?.map((n) => n.props)).toEqual([
      { text: "About", level: 1 },
      { text: "Hello" },
    ]);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  test("W-912: an empty body or a collection without rich text says so", async () => {
    expect(
      await convertEntryBody(fake({ content: [] }).fetcher, { collection: "pages", id: "1" }),
    ).toEqual({ ok: false, message: "The saved content field is empty." });
    expect(
      await convertEntryBody(fake({}, [{ slug: "title", type: "string" }]).fetcher, {
        collection: "pages",
        id: "1",
      }),
    ).toEqual({ ok: false, message: "This collection has no rich-text field to convert." });
  });
});
