import { describe, expect, test } from "bun:test";
import type { Layout } from "../core/index.ts";
import { abArmsFor, visitorFor } from "./visitor.ts";

const layout = {
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "head0001",
        type: "heading",
        props: { text: "A", level: 2 },
        variant: { test: "hero-cta", arm: "a" },
      },
      {
        id: "head0002",
        type: "heading",
        props: { text: "B", level: 2 },
        variant: { test: "hero-cta", arm: "b" },
      },
    ],
  },
} as Layout;

function astroWith(cookie?: string) {
  const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
  if (cookie) jar.set("emvb_ab_hero_cta", { value: cookie });
  const headers = new Headers({ Vary: "Accept-Encoding" });
  return {
    jar,
    headers,
    astro: {
      url: new URL("https://example.com/"),
      cookies: {
        get: (name: string) => jar.get(name),
        set: (name: string, value: string, options?: Record<string, unknown>) =>
          void jar.set(name, { value, options }),
      },
      response: { headers },
    },
  };
}

describe("server-side A/B picks (W-312)", () => {
  test("a returning visitor keeps their arm and gets no new cookie", () => {
    const { astro, jar } = astroWith("b");
    expect(abArmsFor(layout, astro)).toEqual({ "hero-cta": "b" });
    expect(jar.get("emvb_ab_hero_cta")?.options).toBeUndefined();
  });

  test("a new visitor gets an arm, a 30-day secure cookie, and a private response", () => {
    const { astro, jar, headers } = astroWith();
    const arm = abArmsFor(layout, astro)?.["hero-cta"];
    expect(arm === "a" || arm === "b").toBe(true);
    const set = jar.get("emvb_ab_hero_cta");
    expect(set?.value).toBe(arm);
    expect(set?.options).toMatchObject({
      path: "/",
      maxAge: 2_592_000,
      httpOnly: true,
      secure: true,
    });
    expect(headers.get("Cache-Control")).toBe("private, no-store");
    expect(headers.get("Vary")).toBe("Accept-Encoding, Cookie");
  });

  test("pages without tests, or hosts without cookies, pick nothing", () => {
    const plain = { ...layout, root: { ...layout.root, children: [] } } as Layout;
    expect(abArmsFor(plain, astroWith().astro)).toBeUndefined();
    expect(abArmsFor(layout, { url: new URL("https://example.com/") })).toBeUndefined();
  });
});

describe("server-side visitor facts (W-313)", () => {
  const withAudience = {
    schemaVersion: 13,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "head0001",
          type: "heading",
          props: { text: "A", level: 2 },
          audience: { countries: ["CA"] },
        },
      ],
    },
  } as Layout;

  test("country from Cloudflare, device from the UA, and a first-visit cookie", () => {
    const { astro, jar, headers } = astroWith();
    const request = new Request("https://example.com/", {
      headers: { "cf-ipcountry": "ca", "user-agent": "Mozilla/5.0 (iPhone) Mobile" },
    });
    const visitor = visitorFor(withAudience, { ...astro, request });
    expect(visitor).toMatchObject({ country: "CA", device: "mobile", returning: false });
    expect(typeof visitor?.now).toBe("number");
    expect(jar.get("emvb_seen")?.value).toBe("1");
    expect(headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("a seen visitor is returning; XX and Tor are no country; the cf object is read too", () => {
    const { astro, jar } = astroWith();
    jar.set("emvb_seen", { value: "1" });
    const request = new Request("https://example.com/", { headers: { "cf-ipcountry": "XX" } });
    const visitor = visitorFor(withAudience, {
      ...astro,
      request,
      locals: { runtime: { cf: { country: "FR" } } },
    });
    expect(visitor?.returning).toBe(true);
    expect(visitor?.country).toBe("FR");
  });

  test("W-312 a personalized response opts out of Astro's route cache; a static one doesn't", () => {
    const calls: unknown[] = [];
    const cache = { enabled: true, set: (input: false) => void calls.push(input) };
    abArmsFor(layout, { ...astroWith().astro, cache });
    visitorFor(withAudience, { ...astroWith().astro, cache });
    expect(calls).toEqual([false, false]);
    visitorFor(layout, { ...astroWith().astro, cache });
    expect(calls).toHaveLength(2);
  });

  test("layouts without visitor rules read nothing and stay cacheable", () => {
    const { astro, headers } = astroWith();
    expect(visitorFor(layout, astro)).toBeUndefined();
    expect(headers.get("Cache-Control")).toBeNull();
  });
});
