import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// S-12 (W-1001): emvb.dev sends security headers (Cloudflare Pages reads site/public/_headers).
test("emvb.dev sends a CSP, nosniff, frame-ancestors and a referrer policy on every path", () => {
  const text = readFileSync(join(import.meta.dir, "../site/public/_headers"), "utf8");
  const block = text.split(/\n(?=\S)/).find((part) => part.startsWith("/*")) ?? "";
  const headers = Object.fromEntries(
    [...block.matchAll(/^\s+([A-Za-z-]+):\s*(.+)$/gm)].map((m) => [m[1]?.toLowerCase(), m[2]]),
  );
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*(?:https?:|\*)/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
