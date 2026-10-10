import { isParentNode, type Audience, type Layout, type LayoutNode } from "../schema/layout.ts";

/** What the host knows about this visitor (W-313). Anything unknown is left out. */
export type VisitorInfo = {
  /** ISO 3166 two-letter code, uppercase. */
  country?: string;
  device?: "mobile" | "tablet" | "desktop";
  returning?: boolean;
  /** The request time, epoch ms. */
  now?: number;
  /** Segments the host says this visitor is in (W-329), e.g. member, pro. */
  segments?: readonly string[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Hour (0–23) and weekday (0 = Sunday) at `now` in a time zone; UTC when the zone is unknown. */
export function clockIn(now: number, timeZone: string | undefined): { hour: number; day: number } {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(new Date(now));
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const day = WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun");
    return { hour, day: Math.max(0, day) };
  };
  try {
    return read(timeZone ?? "UTC");
  } catch {
    return read("UTC");
  }
}

function inHours(hour: number, from: number, to: number): boolean {
  if (from === to) return true;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Whether a visitor matches every rule in the audience (W-313); unknown facts don't match. */
function matches(audience: Audience, visitor: VisitorInfo): boolean {
  if (audience.countries && !(visitor.country && audience.countries.includes(visitor.country))) {
    return false;
  }
  if (audience.devices && !(visitor.device && audience.devices.includes(visitor.device))) {
    return false;
  }
  if (audience.visitor) {
    if (visitor.returning === undefined) return false;
    if ((audience.visitor === "returning") !== visitor.returning) return false;
  }
  if (audience.segments) {
    const has = new Set(visitor.segments ?? []);
    if (!audience.segments.some((segment) => has.has(segment))) return false;
  }
  if (audience.hours || audience.days) {
    if (visitor.now === undefined) return false;
    const { hour, day } = clockIn(visitor.now, audience.timeZone);
    if (audience.hours && !inHours(hour, audience.hours.from, audience.hours.to)) return false;
    if (audience.days && !audience.days.includes(day)) return false;
  }
  return true;
}

/** Whether a node shows for this visitor (W-313). No audience = everyone. */
export function audienceShows(node: LayoutNode, visitor: VisitorInfo | undefined): boolean {
  const audience = node.audience;
  if (!audience) return true;
  const match = matches(audience, visitor ?? {});
  return audience.hide ? !match : match;
}

/** Does any element in the layout have an audience? Hosts then read the visitor (W-313). */
export function layoutUsesAudience(layout: Layout): boolean {
  return hasAudience(layout.root);
}

const hasAudience = (node: LayoutNode): boolean =>
  Boolean(node.audience) || (isParentNode(node) && node.children.some(hasAudience));

/** A device from a User-Agent and the Sec-CH-UA-Mobile hint (W-313). */
export function deviceFromUserAgent(
  ua: string | null | undefined,
  mobileHint?: string | null,
): VisitorInfo["device"] {
  if (mobileHint === "?1") return "mobile";
  if (!ua) return mobileHint === "?0" ? "desktop" : undefined;
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

const DEVICE_LABELS = { mobile: "mobile", tablet: "tablet", desktop: "desktop" } as const;

/** A short summary for the canvas and Layers, e.g. "CA, US · mobile · returning" (W-313). */
export function audienceSummary(audience: Audience): string {
  const parts: string[] = [];
  if (audience.countries)
    parts.push(
      audience.countries.slice(0, 3).join(", ") + (audience.countries.length > 3 ? "…" : ""),
    );
  if (audience.devices) parts.push(audience.devices.map((d) => DEVICE_LABELS[d]).join("/"));
  if (audience.visitor) parts.push(audience.visitor === "new" ? "new visitors" : "returning");
  if (audience.segments)
    parts.push(audience.segments.slice(0, 3).join("/") + (audience.segments.length > 3 ? "…" : ""));
  if (audience.hours) parts.push(`${audience.hours.from}:00–${audience.hours.to}:00`);
  if (audience.days) parts.push(audience.days.map((d) => WEEKDAYS[d]).join(" "));
  const who = parts.join(" · ") || "everyone";
  return audience.hide ? `Hidden for ${who}` : `Only ${who}`;
}
