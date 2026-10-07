import type { APIRoute } from "astro";

/** robots.txt: everything may be crawled; points at the sitemap on the site's own domain. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("/sitemap.xml", site ?? "https://emvb.dev").href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
