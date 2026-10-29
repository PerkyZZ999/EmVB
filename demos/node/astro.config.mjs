import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { formsPlugin } from "@emdash-cms/plugin-forms";
import { emvb } from "@perkyzz/emvb";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
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
      database: sqlite({ url: "file:./data.db" }),
      storage: local({
        directory: "./uploads",
        baseUrl: "/_emdash/api/media/file",
      }),
      plugins: [formsPlugin(), emvb({ canvasStyles: ["/site.css"], canvasCollections: ["pages"] })],
    }),
  ],
  devToolbar: { enabled: false },
});
