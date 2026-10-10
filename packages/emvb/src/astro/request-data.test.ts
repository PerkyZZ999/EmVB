import { describe, expect, test } from "bun:test";
import type { Layout, LayoutNode } from "../core/index.ts";
import { bindingDataFor } from "./request-data.ts";

const page = (children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 14,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;

/** A page whose only element is a synced section; the section part holds the dynamic bits. */
const synced: LayoutNode = {
  id: "sect0001",
  type: "section",
  props: { partId: "SECT0001" },
  children: [],
} as never;

const cookieJar = () => {
  const jar = new Map<string, string>();
  return {
    jar,
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) ?? "" } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  };
};

const astroFor = (url: string, headers: Record<string, string> = {}) => {
  const cookies = cookieJar();
  const response = { headers: new Headers() };
  return {
    cookies,
    response,
    astro: { url: new URL(url), request: new Request(url, { headers }), cookies, response },
  };
};

describe("W-312/W-313 request data covers synced sections", () => {
  const template = page([
    {
      id: "head0001",
      type: "heading",
      props: { text: "A", level: 2 },
      variant: { test: "hero", arm: "a" },
    },
    {
      id: "head0002",
      type: "heading",
      props: { text: "B", level: 2 },
      variant: { test: "hero", arm: "b" },
    },
    {
      id: "text0001",
      type: "text",
      props: { text: "Hi" },
      audience: { countries: ["CA"] },
    },
    {
      id: "text0002",
      type: "text",
      props: { text: "x" },
      bind: { text: { source: "param", key: "ref" } },
    },
  ] as never);

  test("A/B arms, the visitor and URL parameters are read for a section's elements", async () => {
    const { astro, cookies, response } = astroFor("https://site.test/?ref=news", {
      "cf-ipcountry": "CA",
    });
    const data = await bindingDataFor(page([synced]), astro.url, astro as never, [template]);
    // A fresh pick, kept in the test's cookie.
    expect(data.abArms?.["hero"]).toMatch(/^[ab]$/);
    expect(cookies.jar.get("emvb_ab_hero")).toBe(data.abArms?.["hero"]);
    expect(data.visitor?.country).toBe("CA");
    expect(data.params).toEqual({ ref: "news" });
    // W-307: URL-parameter links are held to the page's own origin.
    expect(data.origin).toBe("https://site.test");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("without templates the page alone decides, and a static page stays cacheable", async () => {
    const { astro, cookies, response } = astroFor("https://site.test/");
    const data = await bindingDataFor(page([synced]), astro.url, astro as never);
    expect(data).toEqual({});
    expect(cookies.jar.size).toBe(0);
    expect(response.headers.get("Cache-Control")).toBeNull();
  });
});

describe("W-329 the host's visitor facts reach the request data", () => {
  test("segments from the host are in data.visitor, so Visitors rules can match them", async () => {
    const { astro } = astroFor("https://site.test/");
    const members = page([
      {
        id: "text0003",
        type: "text",
        props: { text: "Members only" },
        audience: { segments: ["member"] },
      },
    ] as never);
    const data = await bindingDataFor(members, astro.url, astro as never, [], {
      visitor: { segments: ["member", "pro"] },
    });
    expect(data.visitor?.segments).toEqual(["member", "pro"]);
    const none = await bindingDataFor(members, astro.url, astro as never);
    expect(none.visitor?.segments).toBeUndefined();
  });
});
