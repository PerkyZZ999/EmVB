import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// W-808: the home page's code panes and the sign-in link scroll sideways. axe
// (scrollable-region-focusable, WCAG 2.1.1) found no way to reach them from the keyboard, so each
// is a focusable, named region.
const read = (path: string) =>
  readFileSync(new URL(`../../site/src/components/${path}`, import.meta.url), "utf8");

describe("emvb.dev scrolling code is keyboard reachable (W-808)", () => {
  test("every code pane in the pipeline is a focusable named region", () => {
    const pres = read("Pipeline.astro").match(/<pre\b[^>]*>/g) ?? [];
    expect(pres.length).toBe(3);
    for (const pre of pres) {
      expect(pre).toContain('tabindex="0"');
      expect(pre).toContain('role="region"');
      expect(pre).toMatch(/aria-label="[^"]+"/);
    }
  });

  test("every terminal block is a focusable named region", () => {
    const terms = read("GetStarted.astro").match(/<div class="terminal"[^>]*>/g) ?? [];
    expect(terms.length).toBeGreaterThan(0);
    for (const t of terms) {
      expect(t).toContain('tabindex="0"');
      expect(t).toContain('role="region"');
      expect(t).toMatch(/aria-label="[^"]+"/);
    }
  });

  test("the sign-in link's code is a focusable named region", () => {
    const code = read("GetStarted.astro").match(/<code\b[^>]*>\s*http:\/\/127/)?.[0] ?? "";
    expect(code).toContain('tabindex="0"');
    expect(code).toContain('role="region"');
  });
});
