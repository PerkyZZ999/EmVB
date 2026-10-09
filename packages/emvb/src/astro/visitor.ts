import {
  abCookieName,
  collectAbTests,
  deviceFromUserAgent,
  layoutUsesAudience,
  pickArm,
  type AbArm,
  type Layout,
  type VisitorInfo,
} from "../core/index.ts";

/** What EmVB reads from Astro to decide per-visitor content on the server (W-312, W-313). */
export type VisitorAstro = {
  url: URL;
  request?: Request;
  cookies?: {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, options?: Record<string, unknown>): void;
  };
  response?: { headers: Headers };
  locals?: unknown;
  /** Astro's route cache, when the host configured a provider. */
  cache?: { enabled: boolean; set(input: false): void };
};

const AB_COOKIE_DAYS = 30;

const random = (): number => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] ?? 0) / 2 ** 32;
};

/**
 * The response varies per visitor: keep shared caches from serving one visitor's arm or
 * audience to another (W-312), including Astro's route cache. A host that sets cache hints
 * after this should skip them when `Cache-Control` is private (the demos' Base layout does).
 */
function markPersonalized(astro: VisitorAstro): void {
  if (astro.cache?.enabled) astro.cache.set(false);
  const headers = astro.response?.headers;
  if (!headers) return;
  headers.set("Cache-Control", "private, no-store");
  const vary = headers.get("Vary");
  if (!vary?.toLowerCase().includes("cookie"))
    headers.set("Vary", vary ? `${vary}, Cookie` : "Cookie");
}

/**
 * Picks each A/B test's arm for this visitor (W-312): the arm in their cookie, or a fresh pick
 * that the cookie then keeps for 30 days. Without cookie access the visitor sees arm A.
 */
export function abArmsFor(
  layout: Layout | null,
  astro: VisitorAstro,
): Record<string, AbArm> | undefined {
  if (!layout) return undefined;
  const tests = collectAbTests(layout);
  if (tests.length === 0) return undefined;
  const cookies = astro.cookies;
  if (!cookies) return undefined;
  const arms: Record<string, AbArm> = {};
  for (const test of tests) {
    const name = abCookieName(test.test);
    const { arm, fresh } = pickArm(test, cookies.get(name)?.value, random());
    arms[test.test] = arm;
    if (fresh) {
      try {
        cookies.set(name, arm, {
          path: "/",
          maxAge: AB_COOKIE_DAYS * 86_400,
          sameSite: "lax",
          httpOnly: true,
          secure: astro.url.protocol === "https:",
        });
      } catch {
        // Headers already sent (a streamed layout): the pick holds for this response only.
      }
    }
  }
  markPersonalized(astro);
  return arms;
}

/** Marks a visitor as seen, so their next visit counts as returning (W-313). */
const SEEN_COOKIE = "emvb_seen";
const SEEN_DAYS = 365;

const COUNTRY = /^[A-Z]{2}$/;

/** The visitor's country from the edge: Cloudflare's header or `cf` object, or Vercel's header. */
function countryOf(astro: VisitorAstro): string | undefined {
  const headers = astro.request?.headers;
  const runtime = (astro.locals as { runtime?: { cf?: { country?: unknown } } } | undefined)
    ?.runtime;
  const cf = (astro.request as { cf?: { country?: unknown } } | undefined)?.cf;
  const candidates = [
    headers?.get("cf-ipcountry"),
    headers?.get("x-vercel-ip-country"),
    runtime?.cf?.country,
    cf?.country,
  ];
  for (const value of candidates) {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    // XX is Cloudflare's "unknown" and T1 is Tor: neither is a country.
    if (COUNTRY.test(code) && code !== "XX" && code !== "T1") return code;
  }
  return undefined;
}

/**
 * What the server knows about this visitor, for visitor-aware elements (W-313): country from
 * the edge, device from the User-Agent, new or returning from a first-party cookie, and the time.
 * Only read when the layout has a visitor rule.
 */
export function visitorFor(layout: Layout | null, astro: VisitorAstro): VisitorInfo | undefined {
  if (!layout || !layoutUsesAudience(layout)) return undefined;
  const headers = astro.request?.headers;
  const visitor: VisitorInfo = { now: Date.now() };
  const country = countryOf(astro);
  if (country) visitor.country = country;
  const device = deviceFromUserAgent(headers?.get("user-agent"), headers?.get("sec-ch-ua-mobile"));
  if (device) visitor.device = device;
  if (astro.cookies) {
    visitor.returning = astro.cookies.get(SEEN_COOKIE)?.value === "1";
    if (!visitor.returning) {
      try {
        astro.cookies.set(SEEN_COOKIE, "1", {
          path: "/",
          maxAge: SEEN_DAYS * 86_400,
          sameSite: "lax",
          httpOnly: true,
          secure: astro.url.protocol === "https:",
        });
      } catch {
        // Headers already sent: they count as new again next time.
      }
    }
  }
  markPersonalized(astro);
  return visitor;
}
