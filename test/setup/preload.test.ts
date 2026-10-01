import { expect, test } from "bun:test";

// W-091: happydom.test.ts imports happydom.ts (for holdsDomNode), and that import registers the
// DOM by itself, so it passes even when bunfig.toml stops preloading the file. This file imports
// nothing from the setup, so it fails when the preload is missing. Run it on its own: in one bun
// process, a file that imports happydom.ts first would register the DOM for it.
test("bunfig's preload provides the DOM at the plugin admin URL before any import", () => {
  expect(typeof document).toBe("object");
  expect(window.location.pathname).toBe("/_emdash/admin/plugins/emvb/pages");
  expect((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT).toBe(
    true,
  );
});
