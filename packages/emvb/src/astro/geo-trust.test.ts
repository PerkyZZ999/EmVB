import { afterEach, describe, expect, test } from "bun:test";
import { setGeoTrust } from "../core/geo-trust.ts";
import { countryOf } from "./visitor.ts";

// S-10 (W-999): off Cloudflare and Vercel, cf-ipcountry and x-vercel-ip-country come from the
// visitor, who could pick the country whose content they see.

const visit = (headers: Record<string, string>, cf?: { country: string }) =>
  ({
    request: Object.assign(new Request("https://site.test/", { headers }), cf ? { cf } : {}),
  }) as never;
const both = { "cf-ipcountry": "CA", "x-vercel-ip-country": "FR" };
const userAgent = Object.getOwnPropertyDescriptor(globalThis.navigator, "userAgent");

afterEach(() => {
  setGeoTrust(undefined);
  delete process.env["VERCEL"];
  // The test sets an own property over Navigator's getter; removing it restores the real one.
  if (userAgent) Object.defineProperty(globalThis.navigator, "userAgent", userAgent);
  else delete (globalThis.navigator as { userAgent?: string }).userAgent;
});

describe("country headers count only where an edge sets them (W-999, S-10)", () => {
  test("on a plain server, visitor-sent headers are ignored; request.cf still counts", () => {
    expect(countryOf(visit(both))).toBeUndefined();
    expect(countryOf(visit(both, { country: "DE" }))).toBe("DE");
  });

  test("on Cloudflare Workers, Cloudflare's header counts", () => {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      value: "Cloudflare-Workers",
      configurable: true,
    });
    expect(countryOf(visit({ "cf-ipcountry": "CA" }))).toBe("CA");
    expect(countryOf(visit({ "x-vercel-ip-country": "FR" }))).toBeUndefined();
  });

  test("on Vercel, Vercel's header counts", () => {
    process.env["VERCEL"] = "1";
    expect(countryOf(visit({ "x-vercel-ip-country": "FR" }))).toBe("FR");
    expect(countryOf(visit({ "cf-ipcountry": "CA" }))).toBeUndefined();
  });

  test("trustGeoHeaders: true trusts both; false trusts neither, even on Cloudflare", () => {
    expect(countryOf(visit(both), true)).toBe("CA");
    Object.defineProperty(globalThis.navigator, "userAgent", {
      value: "Cloudflare-Workers",
      configurable: true,
    });
    expect(countryOf(visit(both), false)).toBeUndefined();
  });
});
