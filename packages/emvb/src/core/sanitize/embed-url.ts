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

function stripAutoplay(url: URL): void {
  url.searchParams.delete("autoplay");
  url.searchParams.delete("autoPlay");
}

function youtubeId(parsed: URL): string | undefined {
  const host = parsed.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : undefined;
  }
  if (parsed.pathname.startsWith("/embed/")) {
    const id = parsed.pathname.slice("/embed/".length).split("/")[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : undefined;
  }
  if (parsed.pathname.startsWith("/shorts/")) {
    const id = parsed.pathname.slice("/shorts/".length).split("/")[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : undefined;
  }
  const v = parsed.searchParams.get("v");
  return v && /^[\w-]{6,}$/.test(v) ? v : undefined;
}

function vimeoId(parsed: URL): string | undefined {
  const host = parsed.hostname.toLowerCase();
  if (host === "player.vimeo.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videoIdx = parts.indexOf("video");
    const id = videoIdx >= 0 ? parts[videoIdx + 1] : parts[0];
    return id && /^\d{6,}$/.test(id) ? id : undefined;
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const id = parts[0];
  return id && /^\d{6,}$/.test(id) ? id : undefined;
}

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
  if (YT_HOSTS.has(host)) {
    const id = youtubeId(parsed);
    if (!id) return undefined;
    const src = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    stripAutoplay(src);
    return { kind: "iframe", src: src.toString(), provider: "youtube" };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(parsed);
    if (!id) return undefined;
    const src = new URL(`https://player.vimeo.com/video/${id}`);
    stripAutoplay(src);
    return { kind: "iframe", src: src.toString(), provider: "vimeo" };
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
