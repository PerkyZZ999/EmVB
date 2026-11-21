import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { dispatchPluginApiRequest } from "emdash/internal/plugin-test-runtime";
import { PLUGIN_ID } from "../../src/constants.ts";
import { generateCss } from "../../src/core/css/generate.ts";
import { bytesToBase64, FONT_FILE_LIMIT, FONT_MAX_BYTES } from "../../src/core/fonts/files.ts";
import { fakeWoff2 } from "../../src/core/fonts/test-font.ts";
import { emptyDesign } from "../../src/core/schema/design.ts";
import { importGoogleFace, type StoredFont } from "../../src/server/font-routes.ts";
import { createTestRuntime, ROLES, userWithRole } from "./runtime.ts";

// W-1072: custom font files in EmVB's plugin storage, served by a public route; Google fonts
// downloaded once by the server from Google's two font hosts only.

let t: Awaited<ReturnType<typeof createTestRuntime>>;
beforeEach(async () => {
  t = await createTestRuntime();
});
afterEach(async () => {
  await t.dispose();
});

const editor = () => userWithRole(ROLES.editor);

/** GETs the public font route the way a browser does: no session, no CSRF header. */
async function getFont(query: string, method: "GET" | "HEAD" = "GET") {
  const request = new Request(`http://localhost/_emdash/api/plugins/${PLUGIN_ID}/font?${query}`, {
    method,
  });
  return dispatchPluginApiRequest({
    runtime: t.runtime,
    pluginId: PLUGIN_ID,
    path: "/font",
    request,
    user: null,
  });
}

describe("font upload and the public font route (W-1072)", () => {
  test("an editor uploads a WOFF2; anyone loads it as font/woff2 with a year-long cache", async () => {
    const file = fakeWoff2(5000, 3);
    const up = await t.route("fonts/upload", {
      user: editor(),
      body: { name: "C:\\fakepath\\Brand-Bold.woff2", data: bytesToBase64(file) },
    });
    expect(up.status).toBe(200);
    const { url } = (up.body["data"] as { file: { url: string } }).file;
    expect(url).toMatch(/^\/_emdash\/api\/plugins\/emvb\/font\?id=[0-9a-f]{16}$/);

    const response = await getFont(url.split("?")[1] ?? "");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(file.byteLength);
    expect(body.every((b, i) => b === file[i])).toBe(true);

    const again = await t.route("fonts/upload", {
      user: editor(),
      body: { name: "copy.woff2", data: bytesToBase64(file) },
    });
    expect((again.body["data"] as { file: unknown }).file).toEqual({
      id: url.slice(-16),
      url,
      duplicate: true,
    });
  });

  test("a font up to the size cap is stored; a larger one, or one that isn't WOFF2, is refused", async () => {
    const max = await t.route("fonts/upload", {
      user: editor(),
      body: { name: "big.woff2", data: bytesToBase64(fakeWoff2(FONT_MAX_BYTES, 1)) },
    });
    expect(max.status).toBe(200);
    const over = await t.route("fonts/upload", {
      user: editor(),
      body: { name: "huge.woff2", data: bytesToBase64(fakeWoff2(FONT_MAX_BYTES + 3, 1)) },
    });
    expect(over.status).toBe(400);
    const ttf = await t.route("fonts/upload", {
      user: editor(),
      body: {
        name: "font.woff2",
        data: bytesToBase64(new TextEncoder().encode("\0\x01\0\0".padEnd(80))),
      },
    });
    expect(ttf.status).toBe(422);
    expect(JSON.stringify(ttf.body)).toContain("isn't a WOFF2");
  });

  test("uploads need an editor; the font route answers 404 for an unknown or malformed id", async () => {
    const data = bytesToBase64(fakeWoff2());
    expect((await t.route("fonts/upload", { body: { name: "a.woff2", data } })).status).toBe(401);
    const author = await t.route("fonts/upload", {
      user: userWithRole(ROLES.author),
      body: { name: "a.woff2", data },
    });
    expect(author.status).toBe(403);
    expect((await getFont("id=0123456789abcdef")).status).toBe(404);
    expect((await getFont("id=../../etc/passwd")).status).toBe(404);
    expect((await getFont("")).status).toBe(404);
    const google = await t.route("fonts/google", {
      user: userWithRole(ROLES.author),
      body: { family: "Open Sans", weight: 400, style: "normal" },
    });
    expect(google.status).toBe(403);
  });
});

const CSS = (urls: string[]) =>
  urls
    .map(
      (url, i) => `/* ${i === 0 ? "latin" : "latin-ext"} */
@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(${url}) format('woff2');
  unicode-range: U+0000-00FF;
}`,
    )
    .join("\n");

/** A fake Google: the CSS host answers `css`, the file host answers each URL from `files`. */
function fakeGoogle(css: string, files: Record<string, Response | (() => Response)>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const host = new URL(url).hostname;
    if (host === "fonts.googleapis.com") {
      return new Response(css, {
        status: 200,
        headers: { "content-type": "text/css; charset=utf-8" },
      });
    }
    const answer = files[url];
    if (!answer) return new Response("missing", { status: 404 });
    return typeof answer === "function" ? answer() : answer;
  };
  return { fetch, calls };
}

function memoryStore() {
  const rows = new Map<string, StoredFont>();
  return {
    rows,
    get: async (id: string) => rows.get(id) ?? null,
    put: async (id: string, data: StoredFont) => void rows.set(id, data),
    exists: async (id: string) => rows.has(id),
    count: async () => rows.size,
  };
}

const woff = (bytes: Uint8Array) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "font/woff2" } });

const A = "https://fonts.gstatic.com/s/opensans/v44/a.woff2";
const B = "https://fonts.gstatic.com/s/opensans/v44/b.woff2";

describe("Google fonts, self-hosted (W-1072)", () => {
  const input = { family: "Open Sans", weight: 400, style: "normal" as const };

  test("the server fetches only Google's hosts, stores the files, and pages load the site's URLs", async () => {
    const google = fakeGoogle(CSS([A, B]), {
      [A]: woff(fakeWoff2(300, 1)),
      [B]: woff(fakeWoff2(300, 2)),
    });
    const files = memoryStore();
    const result = await importGoogleFace(input, { fetch: google.fetch, files });
    expect(google.calls.map((c) => new URL(c.url).hostname)).toEqual([
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "fonts.gstatic.com",
    ]);
    expect(google.calls[0]?.url).toBe(
      "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400&display=swap",
    );
    expect(google.calls.every((c) => c.init.redirect === "manual")).toBe(true);
    expect(String(new Headers(google.calls[0]?.init.headers).get("user-agent"))).toContain(
      "Chrome/",
    );
    expect(files.rows.size).toBe(2);
    expect([...files.rows.values()].every((row) => row.source === "google")).toBe(true);
    expect(result.family).toBe("Open Sans");
    expect(result.faces).toHaveLength(2);

    const design = emptyDesign();
    design.variables.fonts = [
      {
        id: "body",
        name: "Body",
        value: "'Open Sans', sans-serif",
        family: "Open Sans",
        faces: result.faces,
        source: "google",
      },
    ];
    const css = generateCss({
      design,
      usedTypes: new Set(),
      baseCss: new Map(),
      localRules: [
        { id: "a", declarations: [{ property: "font-family", value: "var(--emvb-f-body)" }] },
      ],
    });
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1] ?? "");
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => u.startsWith("/_emdash/api/plugins/emvb/font?id="))).toBe(true);
    expect(/googleapis|gstatic|https?:/.test(css)).toBe(false);
  });

  test("a redirect, an oversized or non-WOFF2 file, or another host in the CSS is refused", async () => {
    const redirect = fakeGoogle(CSS([A]), {
      [A]: new Response(null, { status: 302, headers: { location: "https://evil.test/x.woff2" } }),
    });
    await expect(
      importGoogleFace(input, { fetch: redirect.fetch, files: memoryStore() }),
    ).rejects.toThrow("didn't send a font file");
    expect(redirect.calls.some((c) => c.url.includes("evil.test"))).toBe(false);

    const big = fakeGoogle(CSS([A]), { [A]: () => woff(fakeWoff2(FONT_MAX_BYTES + 100, 1)) });
    await expect(
      importGoogleFace(input, { fetch: big.fetch, files: memoryStore() }),
    ).rejects.toThrow("too large");

    const html = fakeGoogle(CSS([A]), {
      [A]: new Response("<html>".padEnd(200), {
        status: 200,
        headers: { "content-type": "font/woff2" },
      }),
    });
    const files = memoryStore();
    await expect(importGoogleFace(input, { fetch: html.fetch, files })).rejects.toThrow("WOFF2");
    expect(files.rows.size).toBe(0);

    const elsewhere = fakeGoogle(CSS(["https://evil.test/s/a.woff2"]), {});
    await expect(
      importGoogleFace(input, { fetch: elsewhere.fetch, files: memoryStore() }),
    ).rejects.toThrow("no WOFF2 file");
    expect(elsewhere.calls).toHaveLength(1);
  });

  test("an unknown family says so; too many files per weight, or a full store, are refused", async () => {
    const unknown = async () => new Response("bad family", { status: 400 });
    await expect(importGoogleFace(input, { fetch: unknown, files: memoryStore() })).rejects.toThrow(
      'no "Open Sans"',
    );
    const many = Array.from({ length: 13 }, (_, i) => `https://fonts.gstatic.com/s/x/${i}.woff2`);
    const cjk = fakeGoogle(
      many
        .map(
          (url, i) =>
            `/* [${i}] */ @font-face { font-style: normal; font-weight: 400; src: url(${url}) format('woff2'); }`,
        )
        .join("\n"),
      {},
    );
    await expect(
      importGoogleFace(
        {
          ...input,
          subsets: many
            .map((_, i) => `[${i}]`)
            .slice(0, 12)
            .concat("[12]"),
        },
        { fetch: cjk.fetch, files: memoryStore() },
      ),
    ).rejects.toThrow("Pick fewer subsets");

    const full = memoryStore();
    for (let i = 0; i < FONT_FILE_LIMIT; i++) full.rows.set(`f${i}`, {} as StoredFont);
    const google = fakeGoogle(CSS([A]), { [A]: woff(fakeWoff2(300, 1)) });
    await expect(importGoogleFace(input, { fetch: google.fetch, files: full })).rejects.toThrow(
      `up to ${FONT_FILE_LIMIT} font files`,
    );
  });
});
