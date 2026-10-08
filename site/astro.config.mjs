import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  // The public address of the project site; canonical, Open Graph, sitemap and robots URLs use it.
  site: "https://emvb.dev",
  devToolbar: { enabled: false },
  // React runs only the /playground island: the real EmVB editor, client-side.
  integrations: [react()],
  vite: {
    // The editor's source lives in packages/emvb; it must share the site's one React.
    resolve: { dedupe: ["react", "react-dom"] },
  },
});
