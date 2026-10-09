import { abCookieName, collectAbTests, pickArm, type AbArm, type Layout } from "../core/index.ts";

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
};

const AB_COOKIE_DAYS = 30;

const random = (): number => {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] ?? 0) / 2 ** 32;
};

/**
 * The response varies per visitor: keep shared caches from serving one visitor's arm or
 * audience to another (W-312).
 */
function markPersonalized(astro: VisitorAstro): void {
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
