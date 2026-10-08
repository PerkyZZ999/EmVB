import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { uploadName } from "../../src/server/icon-routes.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// W-239: uploaded SVG icons live in EmVB's plugin storage, sanitized on the server.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
});
afterEach(async () => {
  await t.dispose();
});

const editor = () => userWithRole(ROLES.editor);
type Item = { id: string; name: string; svg: string; uploadedAt: string };

describe("icon upload routes (W-239)", () => {
  test("an editor uploads an SVG; it's stored cleaned and listed newest first", async () => {
    const first = await t.route("icons/upload", {
      user: editor(),
      body: {
        name: "C:\\fakepath\\Brand Logo.svg",
        svg: '<?xml version="1.0"?><svg width="10" height="10" xmlns:inkscape="i" inkscape:version="1"><path style="fill:#e11d48" d="M0 0h10"/></svg>',
      },
    });
    expect(first.status).toBe(200);
    const data = first.body["data"] as { item: Item; imagesLeftOut: number };
    expect(data.item.id).toMatch(/^[0-9a-f]{16}$/);
    expect(data.item.name).toBe("Brand Logo");
    expect(data.item.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#e11d48" d="M0 0h10"></path></svg>',
    );
    expect(data.imagesLeftOut).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await t.route("icons/upload", {
      user: editor(),
      body: { name: "second.svg", svg: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>' },
    });
    const secondId = (second.body["data"] as { item: Item }).item.id;
    const list = await t.route("icons", { user: editor() });
    expect(list.status).toBe(200);
    const items = (list.body["data"] as { items: Item[] }).items;
    expect(items.map((item) => item.id)).toEqual([secondId, data.item.id]);
    expect(items[1]).toEqual(data.item);
  });

  test("a hostile SVG is refused with 422 and the reason, and nothing is stored", async () => {
    const result = await t.route("icons/upload", {
      user: editor(),
      body: {
        name: "evil.svg",
        svg: '<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(1)</script></svg>',
      },
    });
    expect(result.status).toBe(422);
    expect(JSON.stringify(result.body)).toContain("scripts, event handlers or embedded HTML");
    const list = await t.route("icons", { user: editor() });
    expect((list.body["data"] as { items: Item[] }).items).toEqual([]);
  });

  test("anonymous visitors and authors can neither list nor upload", async () => {
    const svg = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>';
    for (const user of [undefined, userWithRole(ROLES.author)]) {
      // oxlint-disable-next-line no-await-in-loop -- one runtime; requests in turn
      const list = await t.route("icons", user ? { user } : {});
      expect(list.status).toBeGreaterThanOrEqual(401);
      // oxlint-disable-next-line no-await-in-loop -- one runtime; requests in turn
      const upload = await t.route("icons/upload", {
        ...(user ? { user } : {}),
        body: { name: "a.svg", svg },
      });
      expect(upload.status).toBeGreaterThanOrEqual(401);
    }
  });

  test("a file name becomes a short label", () => {
    expect(uploadName("/home/me/Icons/rocket.SVG")).toBe("rocket");
    expect(uploadName(".svg")).toBe("Uploaded icon");
    expect(uploadName("x".repeat(300)).length).toBe(80);
  });
});
