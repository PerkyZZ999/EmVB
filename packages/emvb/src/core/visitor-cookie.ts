/**
 * W-1092 (#34): when EmVB may set the `emvb_seen` cookie that new/returning Visitors rules use.
 * Set from `emvb({ visitorCookie, visitorCookieConsent })` when the plugin starts; read when a
 * page with such a rule renders. Kept on globalThis for the same reason as the geo-header setting
 * (core/geo-trust.ts): the plugin and the page renderer can load this module twice.
 *
 * - `"always"` (default, as before 1.4.1): set it on a first visit to a page with such a rule.
 * - `"consent"`: only when the request carries the site's own consent cookie with an accepted
 *   value. Without consent, EmVB neither reads nor sets it and everyone counts as new.
 * - `"never"`: never read or set; everyone counts as new.
 */
export type VisitorCookieMode = "always" | "consent" | "never";

/** The first-party cookie a site's consent banner sets, and the value(s) that mean "yes". */
export type VisitorCookieConsent = { cookie: string; value?: string | string[] };

export type VisitorCookieSetting = {
  mode: VisitorCookieMode;
  /** Only in "consent" mode; without a valid one, "consent" behaves as "never". */
  consent?: { cookie: string; values: string[] };
};

/** Values that count as consent when the site doesn't name its own (compared case-insensitively). */
const DEFAULT_CONSENT_VALUES = new Set(["1", "true", "yes", "granted", "accepted", "allow", "all"]);

/** A cookie name (an RFC 6265 token), as a site owner would type it. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/;
const MAX_VALUES = 20;
const MAX_VALUE_LENGTH = 256;

const KEY = Symbol.for("emvb.visitorCookie");
type Holder = { [KEY]?: VisitorCookieSetting };

/** The setting from the two options; anything unrecognised falls back to the safe reading. */
export function visitorCookieSetting(mode: unknown, consent?: unknown): VisitorCookieSetting {
  if (mode === "never") return { mode: "never" };
  if (mode !== "consent") return { mode: "always" };
  const parsed = consentOption(consent);
  return parsed ? { mode: "consent", consent: parsed } : { mode: "never" };
}

function consentOption(input: unknown): VisitorCookieSetting["consent"] {
  if (!input || typeof input !== "object") return undefined;
  const { cookie, value } = input as { cookie?: unknown; value?: unknown };
  if (typeof cookie !== "string" || !COOKIE_NAME.test(cookie.trim())) return undefined;
  const given = (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === "string")
    .filter((v) => v.length > 0 && v.length <= MAX_VALUE_LENGTH)
    .slice(0, MAX_VALUES);
  if (value !== undefined && given.length === 0) return undefined;
  return { cookie: cookie.trim(), values: value === undefined ? [] : given };
}

/** The options as `emvb()` passes them to the plugin: only what was set, and only when valid. */
export function visitorCookieOptions(
  mode: unknown,
  consent: unknown,
): { visitorCookie?: VisitorCookieMode; visitorCookieConsent?: VisitorCookieConsent } {
  if (mode !== "always" && mode !== "consent" && mode !== "never") return {};
  const setting = visitorCookieSetting(mode, consent);
  if (setting.mode !== "consent" || !setting.consent) return { visitorCookie: setting.mode };
  const { cookie, values } = setting.consent;
  return {
    visitorCookie: "consent",
    visitorCookieConsent: values.length > 0 ? { cookie, value: values } : { cookie },
  };
}

export function setVisitorCookie(mode: unknown, consent?: unknown): void {
  (globalThis as Holder)[KEY] = visitorCookieSetting(mode, consent);
}

export function visitorCookie(): VisitorCookieSetting {
  return (globalThis as Holder)[KEY] ?? { mode: "always" };
}

/**
 * Whether this request may read and set `emvb_seen`. `readCookie` returns a cookie as the
 * browser sent it. The site's named values match exactly; the defaults ignore case.
 */
export function visitorCookieAllowed(
  setting: VisitorCookieSetting,
  readCookie: (name: string) => string | undefined,
): boolean {
  if (setting.mode === "always") return true;
  if (setting.mode === "never" || !setting.consent) return false;
  const sent = readCookie(setting.consent.cookie);
  if (sent === undefined) return false;
  if (setting.consent.values.length > 0) return setting.consent.values.includes(sent);
  return DEFAULT_CONSENT_VALUES.has(sent.trim().toLowerCase());
}
