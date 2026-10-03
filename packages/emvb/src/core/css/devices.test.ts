import { describe, expect, test } from "bun:test";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { patchDeviceStyle, toggleHidden } from "../design/devices.ts";
import { clearVariableRefs } from "../design/variables.ts";
import { emptyDesign } from "../schema/design.ts";
import { renderPage } from "../render/index.ts";
import { DEVICE_MEDIA, DEVICE_PREVIEW_PX, deviceForWidth } from "../theme/popup-rules.ts";

describe("per-device styles (W-096)", () => {
  test("preview widths sit on the same side of the breakpoints as the media queries", () => {
    expect(deviceForWidth(DEVICE_PREVIEW_PX.mobile)).toBe("mobile");
    expect(deviceForWidth(DEVICE_PREVIEW_PX.tablet)).toBe("tablet");
    expect(deviceForWidth(767)).toBe("mobile");
    expect(deviceForWidth(768)).toBe("tablet");
    expect(deviceForWidth(1024)).toBe("tablet");
    expect(deviceForWidth(1025)).toBe("desktop");
    expect(DEVICE_MEDIA.mobile).toBe("(max-width: 767px)");
    expect(DEVICE_MEDIA.tablet).toBe("(max-width: 1024px)");
  });

  test("tablet overrides come first, mobile overrides win, and hide uses its own query", () => {
    const layout = s1Page();
    const heading = layout.root.children[0];
    if (!heading) throw new Error("missing heading");
    heading.devices = { tablet: { color: "#111111" }, mobile: { color: "#222222" } };
    heading.hiddenOn = ["desktop"];
    layout.root.devices = { mobile: { fontSize: { value: 14, unit: "px" } } };
    layout.root.hiddenOn = ["mobile"];
    const css = renderPage(layout, emptyDesign(), { mode: "public" }).css;
    const tabletAt = css.indexOf(`@media ${DEVICE_MEDIA.tablet}`);
    const mobileAt = css.indexOf(`@media ${DEVICE_MEDIA.mobile}`);
    expect(tabletAt >= 0 && mobileAt > tabletAt).toBe(true);
    expect(css).toContain(`@media ${DEVICE_MEDIA.tablet}{.emvb-e-${heading.id}{color:#111111}}`);
    expect(css).toContain(
      `@media ${DEVICE_MEDIA.mobile}{.emvb-e-root0001{font-size:14px}.emvb-e-${heading.id}{color:#222222}}`,
    );
    expect(css).toContain(
      `@media ${DEVICE_MEDIA.hideDesktop}{.emvb-e-${heading.id}{display:none}}`,
    );
    expect(css).toContain(`@media ${DEVICE_MEDIA.hideMobile}{.emvb-e-root0001{display:none}}`);
  });

  test("a device override drops with the variable it uses, and an empty device is removed", () => {
    const layout = s1Page();
    const heading = layout.root.children[0];
    if (!heading) throw new Error("missing heading");
    heading.devices = patchDeviceStyle(undefined, "tablet", { color: { var: "ink" } });
    const cleared = clearVariableRefs(layout, "ink", "color");
    expect(cleared.root.children[0]?.devices).toBeUndefined();
    expect(patchDeviceStyle({ tablet: { color: "#111111" } }, "tablet", { color: undefined })).toBe(
      undefined,
    );
    expect(toggleHidden(["mobile"], "mobile")).toBeUndefined();
    expect(toggleHidden(undefined, "tablet")).toEqual(["tablet"]);
  });

  test("the editor canvas follows the previewed device, not the frame width (W-116)", () => {
    const layout = s1Page();
    const heading = layout.root.children[0];
    if (!heading) throw new Error("missing heading");
    heading.devices = { tablet: { color: "#111111" }, mobile: { color: "#222222" } };
    heading.hiddenOn = ["desktop"];
    layout.root.hiddenOn = ["mobile"];
    const h = `.emvb-e-${heading.id}`;
    const css = (previewDevice: "desktop" | "tablet" | "mobile") =>
      renderPage(layout, emptyDesign(), { mode: "editor", previewDevice }).css;

    const desktop = css("desktop");
    expect(desktop).not.toContain("@media (m");
    expect(desktop).not.toContain("#111111");
    expect(desktop).not.toContain("#222222");
    expect(desktop).toContain(`${h}{display:none}`);
    expect(desktop).not.toContain(".emvb-e-root0001{display:none}");

    const tablet = css("tablet");
    expect(tablet).not.toContain("@media (m");
    expect(tablet).toContain(`${h}{color:#111111}`);
    expect(tablet).not.toContain("#222222");
    expect(tablet).not.toContain("{display:none}");

    const mobile = css("mobile");
    expect(mobile).not.toContain("@media (m");
    expect(mobile.indexOf(`${h}{color:#111111}`)).toBeGreaterThan(-1);
    expect(mobile.indexOf(`${h}{color:#222222}`)).toBeGreaterThan(
      mobile.indexOf(`${h}{color:#111111}`),
    );
    expect(mobile).toContain(".emvb-e-root0001{display:none}");
    expect(mobile).not.toContain(`${h}{display:none}`);
  });

  test("a public render ignores a preview device and keeps its media queries (W-116)", () => {
    const layout = s1Page();
    const heading = layout.root.children[0];
    if (!heading) throw new Error("missing heading");
    heading.devices = { tablet: { color: "#111111" } };
    const css = renderPage(layout, emptyDesign(), { mode: "public", previewDevice: "desktop" }).css;
    expect(css).toContain(`@media ${DEVICE_MEDIA.tablet}{.emvb-e-${heading.id}{color:#111111}}`);
  });
});
