import react from "@astrojs/react";
import { defineConfig } from "astro/config";

/** Stylesheets under this size (bytes) are inlined into the pages that use them. */
export const INLINE_CSS_LIMIT = 64 * 1024;

export default defineConfig({
  // The public address of the project site; canonical, Open Graph, sitemap and robots URLs use it.
  site: "https://emvb.dev",
  devToolbar: { enabled: false },
  // React runs only the /playground island: the real EmVB editor, client-side.
  integrations: [react()],
  vite: {
    // The editor's source lives in packages/emvb; it must share the site's one React.
    resolve: { dedupe: ["react", "react-dom"] },
    build: {
      // Page stylesheets go inline, so a page paints without waiting for them (Core Web Vitals, W-1031);
      // the playground's large admin stylesheet stays a cached file. Other assets keep Vite's rule.
      assetsInlineLimit: (file: string, content: Buffer) =>
        file.endsWith(".css") ? content.length < INLINE_CSS_LIMIT : undefined,
    },
  },
});
