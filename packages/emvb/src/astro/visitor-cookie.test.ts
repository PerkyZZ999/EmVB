import { afterEach, describe, expect, test } from "bun:test";
import type { Layout } from "../core/index.ts";
import {
  setVisitorCookie,
  visitorCookieAllowed,
  visitorCookieSetting,
} from "../core/visitor-cookie.ts";
import { visitorFor } from "./visitor.ts";

afterEach(() => setVisitorCookie(undefined));

/** A page whose one element has the given audience. */
const pageWith = (audience: Record<string, unknown>) =>
  ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: "Hi", level: 2 }, audience }],
    },
  }) as Layout;

/** An Astro-like request that sends `cookie` and records what EmVB sets. */
function visit(cookie?: string) {
  const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
  const request = new Request("https://example.com/");
  // Set afterwards: happy-dom's Request drops a Cookie header given to it, as browsers do.
  if (cookie) request.headers.set("cookie", cookie);
  return {
    jar,
    astro: {
      url: new URL("https://example.com/"),
      request,
      cookies: {
        get: (name: string) => jar.get(name),
        set: (name: string, value: string, options?: Record<string, unknown>) =>
          void jar.set(name, { value, options }),
      },
      response: { headers: new Headers() },
    },
  };
}

const newRule = pageWith({ visitor: "new" });
const returningRule = pageWith({ visitor: "returning" });

describe("W-1092 (#34) the emvb_seen cookie", () => {
  test("country, device, segment and time rules never set it", () => {
    for (const audience of [
      { countries: ["CA"] },
      { devices: ["mobile"] },
      { segments: ["member"] },
      { hours: { from: 9, to: 17 } },
      { days: [1, 2] },
    ]) {
      const { astro, jar } = visit();
      const visitor = visitorFor(pageWith(audience), astro);
      expect(jar.has("emvb_seen")).toBe(false);
      expect(visitor?.returning).toBeUndefined();
    }
  });

  test("default (always): a new/returning rule sets it on a first visit", () => {
    const { astro, jar } = visit();
    expect(visitorFor(newRule, astro)?.returning).toBe(false);
    expect(jar.get("emvb_seen")?.value).toBe("1");
    expect(jar.get("emvb_seen")?.options).toMatchObject({ httpOnly: true, maxAge: 365 * 86_400 });
    const back = visit("emvb_seen=1");
    expect(visitorFor(returningRule, back.astro)?.returning).toBe(true);
    expect(back.jar.has("emvb_seen")).toBe(false);
  });

  test("never: not set, not read, everyone is new, and an old one is cleared", () => {
    setVisitorCookie("never");
    const first = visit();
    expect(visitorFor(newRule, first.astro)?.returning).toBe(false);
    expect(first.jar.has("emvb_seen")).toBe(false);
    const old = visit("emvb_seen=1");
    expect(visitorFor(returningRule, old.astro)?.returning).toBe(false);
    expect(old.jar.get("emvb_seen")).toMatchObject({ value: "", options: { maxAge: 0 } });
  });

  test("consent: set only once the site's consent cookie says yes", () => {
    setVisitorCookie("consent", { cookie: "cookie_consent" });
    const none = visit();
    expect(visitorFor(newRule, none.astro)?.returning).toBe(false);
    expect(none.jar.has("emvb_seen")).toBe(false);

    const refused = visit("cookie_consent=denied; emvb_seen=1");
    expect(visitorFor(returningRule, refused.astro)?.returning).toBe(false);
    expect(refused.jar.get("emvb_seen")?.options).toMatchObject({ maxAge: 0 });

    const accepted = visit("cookie_consent=Granted");
    expect(visitorFor(newRule, accepted.astro)?.returning).toBe(false);
    expect(accepted.jar.get("emvb_seen")?.value).toBe("1");

    const back = visit("cookie_consent=yes; emvb_seen=1");
    expect(visitorFor(returningRule, back.astro)?.returning).toBe(true);
    expect(back.jar.has("emvb_seen")).toBe(false);
  });

  test("consent with the site's own value matches it exactly", () => {
    setVisitorCookie("consent", { cookie: "cc", value: ["analytics", "all-on"] });
    const read = (sent: Record<string, string>) => (name: string) => sent[name];
    const setting = visitorCookieSetting("consent", { cookie: "cc", value: "all-on" });
    expect(visitorCookieAllowed(setting, read({ cc: "all-on" }))).toBe(true);
    expect(visitorCookieAllowed(setting, read({ cc: "ALL-ON" }))).toBe(false);
    expect(visitorCookieAllowed(setting, read({ cc: "1" }))).toBe(false);
    const { astro, jar } = visit("cc=analytics");
    visitorFor(newRule, astro);
    expect(jar.get("emvb_seen")?.value).toBe("1");
  });

  test("the host's own returning fact still wins in every mode", () => {
    setVisitorCookie("never");
    const { astro } = visit();
    expect(visitorFor(returningRule, astro, { returning: true })?.returning).toBe(true);
  });

  test("bad options fall back safely: unknown mode is always, consent without a cookie is never", () => {
    expect(visitorCookieSetting(undefined).mode).toBe("always");
    expect(visitorCookieSetting("sometimes").mode).toBe("always");
    expect(visitorCookieSetting("consent").mode).toBe("never");
    expect(visitorCookieSetting("consent", { cookie: "bad name;" }).mode).toBe("never");
    expect(visitorCookieSetting("consent", { cookie: "ok", value: 5 }).mode).toBe("never");
    expect(visitorCookieSetting("consent", { cookie: " ok " })).toEqual({
      mode: "consent",
      consent: { cookie: "ok", values: [] },
    });
  });
});
