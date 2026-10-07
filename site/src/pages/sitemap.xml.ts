import type { APIRoute } from "astro";

/** The site is one page; list it (and any page added later here) on the site's own domain. */
const PATHS = ["/"];

export const GET: APIRoute = ({ site }) => {
  const urls = PATHS.map(
    (path) => `  <url><loc>${new URL(path, site ?? "https://emvb.dev").href}</loc></url>`,
  ).join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
