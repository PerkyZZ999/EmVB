import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";
import emdash from "emdash/astro";

/** W-1035: e2e runs give the demo a fresh folder for local D1 and R2 (default .wrangler/state). */
const data = process.env["EMVB_DEMO_DATA"];
/**
 * W-1096: `bun run e2e:full` runs several dev servers of this demo at once; each keeps its own Vite
 * cache, so one re-optimizing its dependencies never pulls files from under another.
 */
const viteCache = process.env["EMVB_VITE_CACHE"];

export default defineConfig({
  output: "server",
  adapter: cloudflare(data ? { persistState: { path: data } } : {}),
  image: {
    layout: "constrained",
    responsiveStyles: true,
    // W-915: EmVB library Images get a srcset through Astro's image service.
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  integrations: [
    react(),
    emdash({
      // W-929: EmDash's MCP endpoint, so e2e can drive the EmVB tools with the bridge's client.
      mcp: true,
      database: d1({ binding: "DB", session: "auto" }),
      storage: r2({ binding: "MEDIA" }),
      plugins: [
        formsPlugin(),
        // W-1086: the sample extension is bundled into the Worker through its `module`.
        emvb({
          canvasStyles: ["/site.css"],
          canvasCollections: ["pages"],
          extensions: [hello],
          // W-1092: the returning-visitor cookie waits for this consent cookie (e2e sets it).
          visitorCookie: "consent",
          visitorCookieConsent: { cookie: "emvb_demo_consent" },
        }),
      ],
    }),
  ],
  // W-935 (D-068): English at /, French at /fr/. prefixDefaultLocale stays false: EmDash's admin
  // breaks when the default locale is prefixed.
  i18n: {
    defaultLocale: "en",
    locales: ["en", "fr"],
    routing: { prefixDefaultLocale: false },
  },
  devToolbar: { enabled: false },
  vite: {
    ...(viteCache ? { cacheDir: viteCache } : {}),
    // W-1096: the image editor (photocn, a dependency of EmVB's) and the forms runtime load
    // lazily. Pre-bundled when the dev server starts, so a fresh server (a new e2e run, worktree
    // or CI job) doesn't reload the page mid-test the first time one of them appears.
    optimizeDeps: {
      include: [
        "@perkyzz/emvb > photocn",
        "@perkyzz/emvb > photocn/dom",
        "@perkyzz/emvb > photocn/react",
        "@emdash-cms/plugin-forms/client",
      ],
    },
  },
});
