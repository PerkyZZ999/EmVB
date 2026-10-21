import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import {
  Layout as LayoutSchema,
  type Audience,
  type Layout,
  type LayoutNode,
} from "../schema/layout.ts";
import { renderPage } from "../render/index.ts";
import {
  audienceShows,
  audienceSummary,
  clockIn,
  deviceFromUserAgent,
  layoutUsesAudience,
} from "./rules.ts";

const heading = (id: string, text: string, audience?: Audience) =>
  ({
    id,
    type: "heading",
    props: { text, level: 2 },
    ...(audience ? { audience } : {}),
  }) as LayoutNode;
const page = (...children: LayoutNode[]): Layout =>
  ({
    schemaVersion: 17,
    root: { id: "root0001", type: "container", props: {}, children },
  }) as Layout;
// Wednesday 2026-10-07 14:30 UTC (10:30 in Toronto).
const WED_1430 = Date.UTC(2026, 9, 7, 14, 30);

describe("visitor-aware elements (W-313)", () => {
  test("the schema takes country codes, devices, new/returning, hours, days and a zone", () => {
    const ok = page(
      heading("head0001", "x", {
        countries: ["CA", "US"],
        devices: ["mobile"],
        visitor: "returning",
        hours: { from: 9, to: 17 },
        days: [1, 2, 3, 4, 5],
        timeZone: "America/Toronto",
        hide: true,
      }),
    );
    expect(LayoutSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      { countries: ["ca"] },
      { countries: [] },
      { devices: ["watch"] },
      { hours: { from: 24, to: 1 } },
      { days: [7] },
      { timeZone: "../etc" },
    ]) {
      expect(LayoutSchema.safeParse(page(heading("head0001", "x", bad as Audience))).success).toBe(
        false,
      );
    }
  });

  test("every rule must match, and unknown facts don't match", () => {
    const node = heading("head0001", "x", { countries: ["CA"], devices: ["mobile"] });
    expect(audienceShows(node, { country: "CA", device: "mobile" })).toBe(true);
    expect(audienceShows(node, { country: "CA", device: "desktop" })).toBe(false);
    expect(audienceShows(node, { device: "mobile" })).toBe(false);
    expect(audienceShows(node, undefined)).toBe(false);
    expect(audienceShows(heading("head0002", "x"), undefined)).toBe(true);
  });

  test("hide flips the rule: everyone except matching visitors", () => {
    const node = heading("head0001", "x", { visitor: "returning", hide: true });
    expect(audienceShows(node, { returning: true })).toBe(false);
    expect(audienceShows(node, { returning: false })).toBe(true);
    expect(audienceShows(node, {})).toBe(true);
  });

  test("hours and days are read in the chosen time zone, and hours can wrap past midnight", () => {
    expect(clockIn(WED_1430, "America/Toronto")).toEqual({ hour: 10, day: 3 });
    expect(clockIn(WED_1430, "Not/AZone")).toEqual({ hour: 14, day: 3 });
    const office = heading("head0001", "x", {
      hours: { from: 9, to: 17 },
      days: [1, 2, 3, 4, 5],
      timeZone: "America/Toronto",
    });
    expect(audienceShows(office, { now: WED_1430 })).toBe(true);
    expect(audienceShows(office, { now: WED_1430 + 8 * 3_600_000 })).toBe(false);
    const night = heading("head0002", "x", { hours: { from: 22, to: 6 } });
    expect(audienceShows(night, { now: Date.UTC(2026, 9, 7, 23) })).toBe(true);
    expect(audienceShows(night, { now: Date.UTC(2026, 9, 7, 3) })).toBe(true);
    expect(audienceShows(night, { now: WED_1430 })).toBe(false);
  });

  test("W-665: an overnight window counts its after-midnight hours on the day it started", () => {
    const fridayNight = heading("head0003", "x", { hours: { from: 22, to: 2 }, days: [5] });
    // Friday 2026-10-09 23:00 UTC and Saturday 01:00 UTC are both Friday night.
    expect(audienceShows(fridayNight, { now: Date.UTC(2026, 9, 9, 23) })).toBe(true);
    expect(audienceShows(fridayNight, { now: Date.UTC(2026, 9, 10, 1) })).toBe(true);
    // Friday 01:00 is the end of Thursday night; Saturday 23:00 is Saturday night.
    expect(audienceShows(fridayNight, { now: Date.UTC(2026, 9, 9, 1) })).toBe(false);
    expect(audienceShows(fridayNight, { now: Date.UTC(2026, 9, 10, 23) })).toBe(false);
    // Sunday 01:00 (Saturday night) for a Saturday rule wraps the week.
    const saturdayNight = heading("head0004", "x", { hours: { from: 22, to: 2 }, days: [6] });
    expect(audienceShows(saturdayNight, { now: Date.UTC(2026, 9, 11, 1) })).toBe(true);
  });

  test("devices come from the User-Agent and the mobile client hint", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";
    const tab = "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Safari/537.36";
    const pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15";
    expect([iphone, tab, pixel, mac].map((ua) => deviceFromUserAgent(ua))).toEqual([
      "mobile",
      "tablet",
      "mobile",
      "desktop",
    ]);
    expect(deviceFromUserAgent(null, "?1")).toBe("mobile");
    expect(deviceFromUserAgent(undefined)).toBeUndefined();
  });

  test("the public page renders an element only for its audience; the editor shows it, marked", () => {
    const layout = page(
      heading("head0001", "Bonjour", { countries: ["FR"] }),
      heading("head0002", "Hi"),
    );
    expect(layoutUsesAudience(layout)).toBe(true);
    const fr = renderPage(layout, emptyDesign(), { dynamic: { visitor: { country: "FR" } } }).html;
    const ca = renderPage(layout, emptyDesign(), { dynamic: { visitor: { country: "CA" } } }).html;
    expect(fr).toContain("Bonjour");
    expect(ca).not.toContain("Bonjour");
    const editor = renderPage(layout, emptyDesign(), { mode: "editor" }).html;
    expect(editor).toContain('data-emvb-audience="Only FR"');
    expect(audienceSummary({ devices: ["mobile"], visitor: "new", hide: true })).toBe(
      "Hidden for mobile · new visitors",
    );
  });
});
