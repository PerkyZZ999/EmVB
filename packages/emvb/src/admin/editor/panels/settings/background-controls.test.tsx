import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { emptyDesign, type StyleProps } from "../../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { switchFillRemembered, type FillMemory } from "./background-mode.ts";
import { StyleRow } from "./StyleRow.tsx";
import { BackgroundImageControl, GradientControl } from "./BackgroundControls.tsx";
import type { Fetcher } from "../../../api.ts";
import type { StyleKey } from "./style-sections.ts";

afterEach(async () => {
  await cleanup();
});

const patches: Partial<StyleProps>[] = [];

const row = (styleKey: StyleKey, style: StyleProps = {}) =>
  mount(
    <StyleRow
      styleKey={styleKey}
      style={style}
      design={emptyDesign()}
      onPatch={(patch) => patches.push(patch)}
      onDesignChange={async () => undefined}
    />,
  );

describe("background controls (W-094)", () => {
  test("a pasted image URL is saved, and a javascript: URL is refused", async () => {
    patches.length = 0;
    const host = await row("backgroundColor");
    await act(async () => host.querySelector<HTMLElement>('[data-emvb-bg-type="image"]')?.click());
    patches.length = 0;
    const input = host.querySelector<HTMLInputElement>("[data-emvb-bg-url]");
    expect(input?.outerHTML.includes("data-emvb-bg-url")).toBe(true);
    const type = async (text: string) => {
      if (!input) throw new Error("no URL field");
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
          input,
          text,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
    };
    await type("javascript:alert(1)");
    expect(patches).toEqual([]);
    expect(host.textContent?.includes("https://example.com/photo.jpg")).toBe(true);
    await type("https://cdn.example/photo.png");
    expect(patches.at(-1)).toEqual({ backgroundImage: "https://cdn.example/photo.png" });
  });

  test("Add gradient and Add overlay write the starting values", async () => {
    patches.length = 0;
    const host = await row("backgroundColor");
    await act(async () =>
      host.querySelector<HTMLElement>('[data-emvb-bg-type="gradient"]')?.click(),
    );
    expect(patches.at(-1)?.gradient).toEqual({
      type: "linear",
      angle: 180,
      stops: [
        { color: "#ffffff", at: 0 },
        { color: "#000000", at: 100 },
      ],
    });
    await act(async () => host.querySelector<HTMLElement>('[data-emvb-bg-type="image"]')?.click());
    await act(async () => host.querySelector<HTMLElement>("[data-emvb-add-overlay]")?.click());
    expect(patches.at(-1)).toEqual({ overlay: { color: "#000000", opacity: 0.4 } });
  });

  test("an Image fill with no image yet says the element has no background (W-174)", async () => {
    patches.length = 0;
    const host = await row("backgroundColor", { backgroundColor: "#ff0000" });
    await act(async () => host.querySelector<HTMLElement>('[data-emvb-bg-type="image"]')?.click());
    const helper = host.querySelector("[data-emvb-background-image] .emvb-helper")?.textContent;
    expect(helper).toBe("No image yet, so this element has no background.");
    // Switching to Image clears the colour (D-047), so no colour can show through.
    const last = patches.at(-1) ?? {};
    expect("backgroundColor" in last && last.backgroundColor === undefined).toBe(true);
  });

  test("emptying a stop location or the angle falls back to automatic, not 0 (W-180)", async () => {
    patches.length = 0;
    const host = await row("backgroundColor", {
      gradient: {
        type: "linear",
        angle: 45,
        stops: [
          { color: "#ffffff", at: 10 },
          { color: "#ff0000", at: 40 },
          { color: "#000000", at: 90 },
        ],
      },
    });
    const clear = async (key: string) => {
      const input = host.querySelector<HTMLInputElement>(`[data-emvb-number="${key}"]`);
      if (!input) throw new Error(`no ${key} field`);
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      return input;
    };
    await clear("gradient.stop.1");
    expect(patches.at(-1)?.gradient?.stops.map((stop) => stop.at)).toEqual([10, 50, 90]);
    await clear("gradient.stop.0");
    expect(patches.at(-1)?.gradient?.stops.map((stop) => stop.at)).toEqual([0, 40, 90]);
    await clear("gradient.stop.2");
    expect(patches.at(-1)?.gradient?.stops.map((stop) => stop.at)).toEqual([10, 40, 100]);
    const angle = await clear("gradient.angle");
    const gradient = patches.at(-1)?.gradient;
    expect(gradient ? "angle" in gradient : null).toBe(false);
    expect(angle.getAttribute("placeholder")).toBe("180");
  });

  test("switching fill type and back restores what the type last held (W-184)", async () => {
    const GRADIENT: StyleProps["gradient"] = {
      type: "radial",
      stops: [
        { color: "#ff0000", at: 0 },
        { color: "#0000ff", at: 100 },
      ],
    };
    let device: (scope: string, style: StyleProps) => void = () => undefined;
    let current: StyleProps = {};
    function Live() {
      const [style, setStyle] = React.useState<StyleProps>({ gradient: GRADIENT });
      const [scope, setScope] = React.useState("local:desktop");
      device = (next, nextStyle) => {
        setScope(next);
        setStyle(nextStyle);
      };
      current = style;
      return (
        <StyleRow
          styleKey="backgroundColor"
          style={style}
          design={emptyDesign()}
          fillScope={scope}
          onPatch={(patch) => setStyle((before) => ({ ...before, ...patch }))}
          onDesignChange={async () => undefined}
        />
      );
    }
    const host = await mount(<Live />);
    const pick = async (type: string) =>
      act(async () => host.querySelector<HTMLElement>(`[data-emvb-bg-type="${type}"]`)?.click());
    await pick("color");
    expect(current.gradient).toBeUndefined();
    await pick("gradient");
    expect(current.gradient).toEqual(GRADIENT);
    await pick("color");
    // Another device's fill has its own memory, so it starts from the default gradient.
    await act(async () => device("local:tablet", {}));
    await pick("gradient");
    expect(current.gradient?.type).toBe("linear");
    // Back on desktop, the desktop gradient is still remembered.
    await act(async () => device("local:desktop", {}));
    await pick("gradient");
    expect(current.gradient).toEqual(GRADIENT);
  });

  test("the fill memory only fills an empty type and keeps image settings together (W-184)", () => {
    const memory: FillMemory = {};
    const image: StyleProps = {
      backgroundImage: "https://cdn.example/a.png",
      backgroundSize: "contain",
      overlay: { color: "#000000", opacity: 0.4 },
    };
    const toColor = switchFillRemembered(image, "image", "color", memory);
    expect(toColor.backgroundImage).toBeUndefined();
    expect(switchFillRemembered({}, "color", "image", memory)).toMatchObject(image);
    // A type that already holds something keeps it.
    const other = { backgroundImage: "https://cdn.example/b.png" };
    expect(switchFillRemembered(other, "color", "image", memory).backgroundImage).toBe(
      "https://cdn.example/b.png",
    );
    // Nothing remembered: the usual starting values.
    expect(switchFillRemembered({}, "color", "gradient", {}).gradient?.type).toBe("linear");
  });
});

test("UX-033: the Background section's rows name their part instead of repeating Background", async () => {
  const host = await row("backgroundColor");
  expect(
    host.querySelector(".emvb-background-fill > .emvb-var-field-label")?.textContent ?? null,
  ).toBe("Fill");
  const select = host.querySelector('[role="combobox"]');
  const label = select?.getAttribute("aria-label") ?? select?.textContent ?? "";
  const named =
    label === "Background color" ||
    [...host.querySelectorAll(".font-medium.select-none")].some(
      (l) => l.textContent === "Background color",
    );
  expect(named).toBe(true);
});

test("UX-081: gradient selects show names, not raw values", async () => {
  const host = await mount(
    <GradientControl
      value={
        {
          type: "radial",
          position: "top left",
          stops: [
            { color: "#000000", at: 0 },
            { color: "#ffffff", at: 100 },
          ],
        } as never
      }
      design={emptyDesign()}
      onChange={() => undefined}
      onDesignChange={async () => undefined}
    />,
  );
  const shown = [...host.querySelectorAll('[role="combobox"]')].map((c) => c.textContent?.trim());
  expect(shown.slice(0, 2)).toEqual(["Radial", "Top left"]);
});

test("W-823: the background library takes focus, closes on Escape and gives focus back", async () => {
  const fetcher: Fetcher = async () =>
    Response.json({
      data: {
        items: [
          { id: "m1", filename: "sky.png", url: "/media/sky.png", status: "ready", alt: "Sky" },
        ],
      },
    });
  const changes: (string | undefined)[] = [];
  const host = await mount(
    <BackgroundImageControl
      value={undefined}
      fetcher={fetcher}
      onChange={(next) => changes.push(next)}
      reset={null}
    />,
  );
  const opener = host.querySelector<HTMLButtonElement>("[data-emvb-bg-library]");
  const dialog = () => host.querySelector('[role="dialog"]');
  const open = async () => {
    opener?.focus();
    await act(async () => opener?.click());
    await settle();
  };
  await open();
  const close = [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === "Close",
  );
  expect(document.activeElement === close).toBe(true);
  const outside: string[] = [];
  const onOutside = (event: KeyboardEvent) => outside.push(event.key);
  document.addEventListener("keydown", onOutside);
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
  document.removeEventListener("keydown", onOutside);
  expect(dialog()).toBeNull();
  expect(outside).toEqual([]);
  expect(document.activeElement === opener).toBe(true);
  await open();
  const card = host.querySelector<HTMLButtonElement>('[data-emvb-bg-media-id="m1"]');
  card?.focus();
  await act(async () => card?.click());
  expect(dialog()).toBeNull();
  expect(changes).toEqual(["/media/sky.png"]);
  expect(document.activeElement === opener).toBe(true);
});

test("W-824: while uploading, Choose from library and Upload stay focusable and ignore presses", async () => {
  const pending = Promise.withResolvers<Response>();
  const fetcher: Fetcher = async () => pending.promise;
  const host = await mount(
    <BackgroundImageControl value={undefined} fetcher={fetcher} onChange={() => {}} reset={null} />,
  );
  const library = host.querySelector<HTMLButtonElement>("[data-emvb-bg-library]");
  const upload = host.querySelector<HTMLButtonElement>("[data-emvb-bg-upload-btn]");
  const file = host.querySelector<HTMLInputElement>("[data-emvb-bg-upload]");
  if (!library || !upload || !file) throw new Error("Missing background image controls");
  let picks = 0;
  file.addEventListener("click", () => picks++);
  Object.defineProperty(file, "files", { configurable: true, value: [new File(["x"], "a.png")] });
  upload.focus();
  await act(async () => file.dispatchEvent(new Event("change", { bubbles: true })));
  expect([library.disabled, upload.disabled]).toEqual([false, false]);
  expect([library.getAttribute("aria-disabled"), upload.getAttribute("aria-disabled")]).toEqual([
    "true",
    "true",
  ]);
  expect(document.activeElement === upload).toBe(true);
  await act(async () => upload.click());
  await act(async () => library.click());
  expect(picks).toBe(0);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () =>
    pending.resolve(Response.json({ error: { message: "nope" } }, { status: 500 })),
  );
  await settle();
  await act(async () => upload.click());
  expect(picks).toBe(1);
});
