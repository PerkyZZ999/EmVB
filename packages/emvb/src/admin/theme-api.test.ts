import { expect, test } from "bun:test";
import type { Fetcher } from "./api.ts";
import { saveThemePart, type ThemePartDraft } from "./theme-api.ts";

test("UX-094: a theme part with no layout yet saves without sending a null layout", async () => {
  let sent: Record<string, unknown> = {};
  const fetcher: Fetcher = async (_path, init) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ data: { _rev: "r2" } });
  };
  const draft = {
    title: "Footer",
    slug: "footer",
    partType: "footer",
    layout: null,
  } as unknown as ThemePartDraft;
  expect(await saveThemePart(fetcher, "01PART", draft, "r1")).toBe("r2");
  const data = (sent["data"] ?? {}) as Record<string, unknown>;
  expect(data["title"]).toBe("Footer");
  expect("layout" in data).toBe(false);
});
