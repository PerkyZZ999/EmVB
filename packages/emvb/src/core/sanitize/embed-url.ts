/**
 * YouTube / Vimeo → privacy-enhanced embed URLs, or media-library video sources (R-013 / R-032).
 * Never passes through autoplay query params.
 */

import { sanitizeMediaUrl } from "./media-url.ts";

export type EmbedTarget =
  | { kind: "iframe"; src: string; provider: "youtube" | "vimeo" }
  | { kind: "video"; src: string };

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

const matching = (id: string | undefined, pattern: RegExp) =>
  id && pattern.test(id) ? id : undefined;
const YT_ID = /^[\w-]{6,}$/;
const VIMEO_ID = /^\d{6,}$/;
const firstSegment = (path: string) => path.split("/").find(Boolean);

function youtubeId(parsed: URL): string | undefined {
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  if (host === "youtu.be" || host === "www.youtu.be") return matching(firstSegment(path), YT_ID);
  // W-215: /live/ links (a stream or its replay) too.
  for (const prefix of ["/embed/", "/shorts/", "/live/"]) {
    if (path.startsWith(prefix)) return matching(path.slice(prefix.length).split("/")[0], YT_ID);
  }
  return matching(parsed.searchParams.get("v") ?? undefined, YT_ID);
}

/** An unlisted Vimeo video's privacy hash: the player refuses the video without it (W-215). */
const VIMEO_HASH = /^[0-9a-f]{6,32}$/i;

/**
 * The Vimeo id, plus `?h=<hash>` for an unlisted video (W-215): `vimeo.com/<id>/<hash>`,
 * `player.vimeo.com/video/<id>?h=<hash>`, `vimeo.com/channels/<name>/<id>` and
 * `vimeo.com/groups/<name>/videos/<id>`.
 */
function vimeoId(parsed: URL): string | undefined {
  const parts = parsed.pathname.split("/").filter(Boolean);
  const player = parsed.hostname.toLowerCase() === "player.vimeo.com";
  const videoIdx = parts.indexOf("video");
  const at = player
    ? videoIdx >= 0
      ? videoIdx + 1
      : 0
    : parts[0] === "channels"
      ? 2
      : parts[0] === "groups" && parts[2] === "videos"
        ? 3
        : 0;
  const id = matching(parts[at], VIMEO_ID);
  if (!id) return undefined;
  const hash = player ? parsed.searchParams.get("h") : at === 0 ? parts[1] : undefined;
  return hash && VIMEO_HASH.test(hash) ? `${id}?h=${hash}` : id;
}

/** Longest start time kept, in seconds (a day). */
const MAX_START = 86_400;

/**
 * A start time as whole seconds: `90`, `90s`, `1m30s`, `1h2m3s` (W-227). Undefined for anything
 * else, zero, or past MAX_START, so nothing but digits reaches the embed URL.
 */
export function parseStartSeconds(raw: string | null | undefined): number | undefined {
  const match = /^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s?)?$/i.exec(raw?.trim() ?? "");
  if (!match || !raw?.trim()) return undefined;
  const [, h = "0", m = "0", s = "0"] = match;
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return total > 0 && total <= MAX_START ? total : undefined;
}

/** `t=` from the query or the `#t=` fragment, YouTube's `start=` too (W-227). */
function startOf(parsed: URL): number | undefined {
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  return parseStartSeconds(
    parsed.searchParams.get("t") ?? parsed.searchParams.get("start") ?? fragment.get("t"),
  );
}

/** Appends the start time the way each player reads it (W-227). */
const withStart = (provider: "youtube" | "vimeo", src: string, start: number | undefined) =>
  start === undefined
    ? src
    : provider === "youtube"
      ? `${src}?start=${start}`
      : `${src}#t=${start}s`;

/**
 * Embed URLs are built from the id alone (and an unlisted Vimeo hash and a start time in whole
 * seconds, W-227), so no other query param (autoplay included) carries over.
 */
const PROVIDERS = [
  {
    provider: "youtube",
    hosts: YT_HOSTS,
    id: youtubeId,
    embed: "https://www.youtube-nocookie.com/embed/",
  },
  { provider: "vimeo", hosts: VIMEO_HOSTS, id: vimeoId, embed: "https://player.vimeo.com/video/" },
] as const;

/**
 * Resolves an editor-supplied URL to a safe embed target, or undefined if refused.
 * YouTube always becomes `youtube-nocookie.com`; Vimeo becomes `player.vimeo.com`.
 */
export function resolveEmbedUrl(value: string): EmbedTarget | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasScheme) {
    const media = sanitizeMediaUrl(trimmed);
    if (!media) return undefined;
    return { kind: "video", src: media };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.replace(/\s+/g, ""));
  } catch {
    return undefined;
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") return undefined;

  const host = parsed.hostname.toLowerCase();
  const provider = PROVIDERS.find((p) => p.hosts.has(host));
  if (provider) {
    const id = provider.id(parsed);
    return id
      ? {
          kind: "iframe",
          src: withStart(provider.provider, `${provider.embed}${id}`, startOf(parsed)),
          provider: provider.provider,
        }
      : undefined;
  }

  // Allowlisted http(s) media file URLs for <video> (CDN / EmDash media file route).
  const media = sanitizeMediaUrl(trimmed);
  if (!media) return undefined;
  if (
    !/\.(mp4|webm|ogg)(?:$|\?)/i.test(parsed.pathname) &&
    !media.includes("/_emdash/api/media/file/")
  ) {
    return undefined;
  }
  return { kind: "video", src: media };
}
