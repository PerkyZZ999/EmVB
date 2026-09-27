/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// Astro components can't be rendered by `bun test` (it imports .astro files as path strings,
// VALIDATION.md S0-11), so they are tested with Vitest and the Astro container API.
export default getViteConfig(
  { test: { include: ["test/astro/**/*.vitest.ts"], environment: "node" } },
  { configFile: false, logLevel: "error", devToolbar: { enabled: false } },
);
