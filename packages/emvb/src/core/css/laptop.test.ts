import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { toggleHidden } from "../design/devices.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";
import { DEVICE_MEDIA } from "../theme/popup-rules.ts";

const withHeading = (set: (heading: Layout["root"]["children"][number]) => void) => {
  const layout = s1Page();
  const heading = layout.root.children[0];
  if (!heading) throw new Error("missing heading");
  set(heading);
  return layout;
};

describe("Laptop device (W-956)", () => {
  test("laptop styles sit between desktop and tablet; tablets and phones win over them", () => {
    const layout = withHeading((h) => {
      h.devices = { laptop: { color: "#333333" }, tablet: { color: "#111111" } };
    });
    const { css } = renderPage(layout, emptyDesign());
    const laptop = css.indexOf("@media (max-width: 1366.98px){.emvb-e-head0001{color:#333333}}");
    const tablet = css.indexOf("@media (max-width: 1024.98px){.emvb-e-head0001{color:#111111}}");
    expect(laptop).toBeGreaterThan(-1);
    expect(tablet).toBeGreaterThan(laptop);
  });

  test("hidden on Desktop and Laptop is the one rule from 1025 px; each alone has its range", () => {
    const css = (hiddenOn: ("desktop" | "laptop")[]) =>
      renderPage(
        withHeading((h) => {
          h.hiddenOn = hiddenOn;
        }),
        emptyDesign(),
      ).css;
    expect(css(["desktop", "laptop"])).toContain(
      "@media (min-width: 1025px){.emvb-e-head0001{display:none}}",
    );
    expect(css(["desktop"])).toContain(
      "@media (min-width: 1367px){.emvb-e-head0001{display:none}}",
    );
    expect(css(["desktop"])).not.toContain("min-width: 1025px");
    expect(css(["laptop"])).toContain(
      "@media (min-width: 1025px) and (max-width: 1366.98px){.emvb-e-head0001{display:none}}",
    );
  });

  test("the hide queries meet with no gap at fractional widths", () => {
    const bound = (q: string, side: "min" | "max") =>
      Number(new RegExp(`${side}-width: ([0-9.]+)px`).exec(q)?.[1] ?? Number.NaN);
    expect(
      bound(DEVICE_MEDIA.hideDesktopOnly, "min") - bound(DEVICE_MEDIA.hideLaptop, "max"),
    ).toBeLessThanOrEqual(0.02);
    expect(bound(DEVICE_MEDIA.hideLaptop, "min")).toBe(bound(DEVICE_MEDIA.hideDesktop, "min"));
  });

  test("a 0.9 page hidden on Desktop stays hidden on laptops (its CSS is unchanged)", () => {
    const layout = withHeading((h) => {
      h.hiddenOn = ["desktop"];
    });
    const old = validateLayout({ ...layout, schemaVersion: 17 });
    if (!old.ok) throw new Error("refused");
    expect(old.layout.root.children[0]?.hiddenOn).toEqual(["desktop", "laptop"]);
    expect(renderPage(old.layout, emptyDesign()).css).toContain(
      "@media (min-width: 1025px){.emvb-e-head0001{display:none}}",
    );
  });

  test("the Laptop canvas shows laptop styles and hides what is hidden on Laptop", () => {
    const layout = withHeading((h) => {
      h.devices = { laptop: { color: "#333333" }, tablet: { color: "#111111" } };
      h.hiddenOn = ["laptop"];
    });
    const { css } = renderPage(layout, emptyDesign(), { mode: "editor", previewDevice: "laptop" });
    expect(css).toContain(".emvb-e-head0001{color:#333333}");
    expect(css).not.toContain("#111111");
    expect(css).toContain(".emvb-e-head0001{display:none}");
    const desktop = renderPage(layout, emptyDesign(), {
      mode: "editor",
      previewDevice: "desktop",
    }).css;
    expect(desktop).not.toContain("#333333");
    expect(desktop).not.toContain("display:none}");
  });

  test("a class's laptop styles get their own block too", () => {
    const design = {
      ...emptyDesign(),
      classes: [
        {
          id: "card",
          name: "Card",
          style: { color: "#000000" },
          devices: { laptop: { color: "#444444" } },
        },
      ],
    };
    const { css } = renderPage(
      withHeading((h) => (h.classes = ["card"])),
      design,
    );
    expect(css).toContain("@media (max-width: 1366.98px){.emvb-k-card{color:#444444}}");
  });

  test("Hide on device keeps the devices in order", () => {
    expect(toggleHidden(["desktop", "mobile"], "laptop")).toEqual(["desktop", "laptop", "mobile"]);
    expect(
      validateLayout(withHeading((h) => (h.hiddenOn = ["desktop", "laptop", "tablet", "mobile"])))
        .ok,
    ).toBe(true);
  });
});
