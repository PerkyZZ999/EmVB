import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  iconRenameRoute,
  publicUploadedIcon,
  UPLOAD_LIST_LIMIT,
  uploadName,
} from "../../src/server/icon-routes.ts";
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

  test("My uploads is full at the list limit, so no upload drops out of sight (W-535)", async () => {
    // W-972: each icon is its own drawing (the same one again is the upload already there).
    const svgOf = (i: number) => `<svg viewBox="0 0 1 1"><path d="M${i} 0"/></svg>`;
    const svg = svgOf(UPLOAD_LIST_LIMIT);
    let firstId = "";
    for (let i = 0; i < UPLOAD_LIST_LIMIT; i++) {
      // oxlint-disable-next-line no-await-in-loop -- one runtime; uploads in turn
      const up = await t.route("icons/upload", {
        user: editor(),
        body: { name: `i${i}.svg`, svg: svgOf(i) },
      });
      if (i === 0) firstId = (up.body["data"] as { item: Item }).item.id;
    }
    const refused = await t.route("icons/upload", { user: editor(), body: { name: "x.svg", svg } });
    expect(refused.status).toBe(409);
    expect(JSON.stringify(refused.body)).toContain(
      `My uploads holds up to ${UPLOAD_LIST_LIMIT} icons`,
    );
    await t.route("icons/delete", { user: editor(), body: { id: firstId } });
    const accepted = await t.route("icons/upload", {
      user: editor(),
      body: { name: "x.svg", svg },
    });
    expect(accepted.status).toBe(200);
  });

  test("W-972: the same drawing uploaded again is the icon already in My uploads", async () => {
    const svg = '<svg viewBox="0 0 2 2"><path d="M1 1"/></svg>';
    const [a, b] = await Promise.all([
      t.route("icons/upload", { user: editor(), body: { name: "one.svg", svg } }),
      t.route("icons/upload", { user: editor(), body: { name: "copy.svg", svg } }),
    ]);
    const later = await t.route("icons/upload", {
      user: editor(),
      body: { name: "again.svg", svg: `<?xml version="1.0"?>\n${svg}` },
    });
    const list = await t.route("icons", { user: editor() });
    const items = (list.body["data"] as { items: Item[] }).items;
    const ids = [a, b, later].map((r) => (r.body["data"] as { item: Item }).item.id);
    expect(new Set(ids).size).toBe(1);
    expect((later.body["data"] as { duplicate?: boolean }).duplicate).toBe(true);
    expect(items).toHaveLength(1);
  });

  test("W-972: My uploads lists more than one storage page", async () => {
    for (let i = 0; i < 130; i++) {
      // oxlint-disable-next-line no-await-in-loop -- one runtime; uploads in turn
      await t.route("icons/upload", {
        user: editor(),
        body: { name: `p${i}.svg`, svg: `<svg viewBox="0 0 1 1"><path d="M${i} 1"/></svg>` },
      });
    }
    const list = await t.route("icons", { user: editor() });
    expect((list.body["data"] as { items: Item[] }).items).toHaveLength(130);
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

  test("an editor can rename and delete an upload; a missing one is 404", async () => {
    const upload = await t.route("icons/upload", {
      user: editor(),
      body: { name: "mark.svg", svg: '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>' },
    });
    const id = (upload.body["data"] as { item: Item }).item.id;
    const renamed = await t.route("icons/rename", {
      user: editor(),
      body: { id, name: "Brand mark.svg" },
    });
    expect(renamed.status).toBe(200);
    expect((renamed.body["data"] as { item: Item }).item.name).toBe("Brand mark");
    const removed = await t.route("icons/delete", { user: editor(), body: { id } });
    expect(removed.status).toBe(200);
    const again = await t.route("icons/delete", { user: editor(), body: { id } });
    expect(again.status).toBe(404);
    const list = await t.route("icons", { user: editor() });
    expect((list.body["data"] as { items: Item[] }).items).toEqual([]);
  });

  test("a stored upload that fails the SVG allowlist is left out of the list", () => {
    const kept = publicUploadedIcon("0123456789abcdef", {
      name: "Mark",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0"></path></svg>',
      uploadedAt: "2026-10-10T00:00:00.000Z",
    });
    expect(kept?.svg.includes("<path")).toBe(true);
    const dropped = publicUploadedIcon("0123456789abcdef", {
      name: "Evil",
      svg: '<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>',
      uploadedAt: "2026-10-10T00:00:00.000Z",
    });
    expect(dropped).toBeUndefined();
  });

  test("a file name becomes a short label", () => {
    expect(uploadName("/home/me/Icons/rocket.SVG")).toBe("rocket");
    expect(uploadName(".svg")).toBe("Uploaded icon");
    expect(uploadName("x".repeat(300)).length).toBe(80);
  });

  test("control and direction-changing characters leave the label (W-656)", () => {
    expect(uploadName("evil\u202Egvs.exe.svg")).toBe("evilgvs.exe");
    expect(uploadName("a\u0000b\u200Bc\nd.svg")).toBe("a bc d");
    expect(uploadName("\u2066\u2069.svg")).toBe("Uploaded icon");
  });
});

describe("renaming a stored upload (W-390)", () => {
  const renameIn = (svg: string, name = "New.svg") => {
    const rows = new Map([
      ["0123456789abcdef", { name: "Old", svg, uploadedAt: "2026-10-10T00:00:00.000Z" }],
    ]);
    const ctx = {
      input: { id: "0123456789abcdef", name },
      storage: {
        icons: {
          get: async (id: string) => rows.get(id) ?? null,
          put: async (id: string, data: { name: string; svg: string; uploadedAt: string }) => {
            rows.set(id, data);
          },
        },
      },
    };
    const run = iconRenameRoute.handler as unknown as (c: typeof ctx) => Promise<{ item: Item }>;
    return { rows, result: run(ctx) };
  };

  test("a new name may hold a slash (W-655)", async () => {
    const { rows, result } = renameIn('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>', "AC/DC");
    expect((await result).item.name).toBe("AC/DC");
    const stored = rows.get("0123456789abcdef");
    expect(stored && publicUploadedIcon("0123456789abcdef", stored)?.name).toBe("AC/DC");
  });

  test("answers with the checked markup the list sends", async () => {
    const { result } = renameIn('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>');
    const { item } = await result;
    expect(item.name).toBe("New");
    expect(item.svg).toBe('<svg viewBox="0 0 1 1"><path d="M0 0"></path></svg>');
  });

  test("a row that fails the allowlist is not echoed back or renamed", async () => {
    const { rows, result } = renameIn(
      '<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>',
    );
    await expect(result).rejects.toThrow("not in My uploads");
    expect(rows.get("0123456789abcdef")?.name).toBe("Old");
  });
});
