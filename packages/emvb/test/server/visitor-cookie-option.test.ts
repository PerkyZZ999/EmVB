import { afterEach, expect, test } from "bun:test";
import { setVisitorCookie, visitorCookie } from "../../src/core/visitor-cookie.ts";
import { emvb } from "../../src/index.ts";
import { createPlugin } from "../../src/server/plugin.ts";

afterEach(() => setVisitorCookie(undefined));

test("W-1092: emvb({ visitorCookie, visitorCookieConsent }) reaches the renderer through the plugin", () => {
  const options = emvb({
    visitorCookie: "consent",
    visitorCookieConsent: { cookie: "cookie_consent", value: "yes" },
  }).options as Record<string, unknown>;
  expect(options["visitorCookie"]).toBe("consent");
  expect(options["visitorCookieConsent"]).toEqual({ cookie: "cookie_consent", value: ["yes"] });
  createPlugin(options);
  expect(visitorCookie()).toEqual({
    mode: "consent",
    consent: { cookie: "cookie_consent", values: ["yes"] },
  });
  createPlugin(emvb({ visitorCookie: "never" }).options as Record<string, unknown>);
  expect(visitorCookie().mode).toBe("never");
  // Unset keeps the behaviour sites had before.
  expect(emvb().options).not.toHaveProperty("visitorCookie");
  createPlugin({});
  expect(visitorCookie().mode).toBe("always");
});
