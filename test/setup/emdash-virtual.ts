import { plugin } from "bun";

// emdash's runtime reads its Astro config through a Vite virtual module. Outside Astro (bun test with
// `emdash/internal/plugin-test-runtime`) an empty config makes it fall back to its defaults.
plugin({
  name: "emdash-virtual-config",
  setup(build) {
    build.module("virtual:emdash/config", () => ({ exports: { default: {} }, loader: "object" }));
  },
});
