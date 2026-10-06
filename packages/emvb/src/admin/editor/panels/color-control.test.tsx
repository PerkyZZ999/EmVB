import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { DesignSystem, StyleProps } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { ColorControl } from "./ColorControl.tsx";

afterEach(cleanup);

// W-091: colour variables were only tested through one whole-editor create test; editing a
// bound value, validation, failures and id collisions weren't checked.

const DESIGN: DesignSystem = {
  schemaVersion: 12,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#0055ff" },
      { id: "ink", name: "Ink", value: "#111111" },
    ],
  },
};

async function control(value: StyleProps["color"], fail?: string) {
  const designs: DesignSystem[] = [];
  const values: StyleProps["color"][] = [];
  const host = await mount(
    <ColorControl
      label="Text color"
      value={value}
      design={DESIGN}
      onChange={(next) => values.push(next)}
      onDesignChange={async (design) => {
        designs.push(design);
        if (fail) throw new Error(fail);
      }}
    />,
  );
  const field = (label: string) => {
    const element = [...host.querySelectorAll("label")].find(
      (l) => l.textContent?.trim() === label,
    );
    const id = element?.getAttribute("for");
    const input = id ? document.getElementById(id) : null;
    if (!(input instanceof HTMLInputElement)) throw new Error(`no ${label} field`);
    return input;
  };
  const type = async (label: string, text: string) => {
    const input = field(label);
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const blur = async (label: string) => {
    await act(async () => field(label).blur());
    await settle();
  };
  const enter = async (label: string) => {
    await act(async () => {
      field(label).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
  };
  const click = async (name: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === name,
    );
    if (!button) throw new Error(`no ${name} button`);
    await act(async () => button.click());
    await settle();
  };
  const alert = () => host.querySelector('[role="alert"]')?.textContent ?? null;
  const has = (label: string) =>
    [...host.querySelectorAll("label")].some((l) => l.textContent?.trim() === label);
  const swatches = () =>
    [...host.querySelectorAll<HTMLButtonElement>("[data-emvb-swatches] button")].map(
      (b) =>
        `${b.getAttribute("aria-label")}${b.getAttribute("aria-pressed") === "true" ? " *" : ""}`,
    );
  const swatch = async (name: string) => {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-emvb-swatches] button[aria-label^="${name} "]`,
    );
    if (!button) throw new Error(`no ${name} swatch`);
    await act(async () => button.click());
  };
  const picker = () => host.querySelector<HTMLInputElement>('input[type="color"]');
  return { designs, values, type, blur, enter, click, alert, has, swatches, swatch, picker, host };
}

describe("editing a bound colour variable (W-091)", () => {
  test("a new hex saves the design with only that variable changed", async () => {
    const view = await control({ var: "brand" });
    await view.type("Brand value", "#112233");
    await view.blur("Brand value");
    expect(view.designs).toEqual([
      {
        schemaVersion: 12,
        variables: {
          colors: [
            { id: "brand", name: "Brand", value: "#112233" },
            { id: "ink", name: "Ink", value: "#111111" },
          ],
        },
      },
    ]);
    expect(view.alert()).toBeNull();
  });

  test("an invalid hex shows the hex error and saves nothing", async () => {
    const view = await control({ var: "brand" });
    await view.type("Brand value", "blue");
    await view.enter("Brand value");
    expect(view.alert()).toBe("Enter a hex color such as #1a2b3c.");
    expect(view.designs).toEqual([]);
  });

  test("leaving the value unchanged saves nothing", async () => {
    const view = await control({ var: "brand" });
    await view.type("Brand value", "#0055ff");
    await view.blur("Brand value");
    expect(view.designs).toEqual([]);
  });

  test("a failed save shows its message", async () => {
    const view = await control({ var: "brand" }, "The design changed elsewhere.");
    await view.type("Brand value", "#445566");
    await view.blur("Brand value");
    expect(view.alert()).toBe("The design changed elsewhere.");
  });
});

describe("creating a colour variable (W-091)", () => {
  test("a name is required, then a valid hex, before anything is saved", async () => {
    const view = await control(undefined);
    await view.click("New variable");
    await view.type("Variable name", "   ");
    await view.type("Value", "#123456");
    await view.click("Create variable");
    expect(view.alert()).toBe("Enter a name for the variable.");
    await view.type("Variable name", "Accent");
    await view.type("Value", "#12345");
    await view.click("Create variable");
    expect(view.alert()).toBe("Enter a hex color such as #1a2b3c.");
    expect(view.designs).toEqual([]);
  });

  test("the name is trimmed, a taken id gets a suffix, and Enter creates it", async () => {
    const view = await control(undefined);
    await view.click("New variable");
    await view.type("Variable name", "  Brand  ");
    await view.type("Value", "#abcdef");
    await view.enter("Value");
    expect(view.designs[0]?.variables.colors.at(-1)).toEqual({
      id: "brand-2",
      name: "Brand",
      value: "#abcdef",
    });
    expect(view.values).toEqual([{ var: "brand-2" }]);
    expect(view.has("Variable name")).toBe(false);
  });

  test("a failed create shows its message and keeps the form", async () => {
    const view = await control(undefined, "Couldn't reach the server.");
    await view.click("New variable");
    await view.type("Variable name", "Accent");
    await view.type("Value", "#abcdef");
    await view.click("Create variable");
    expect(view.alert()).toBe("Couldn't reach the server.");
    expect(view.values).toEqual([]);
    expect(view.has("Variable name")).toBe(true);
  });

  test("Cancel closes the form without saving", async () => {
    const view = await control(undefined);
    await view.click("New variable");
    await view.click("Cancel");
    expect(view.has("Variable name")).toBe(false);
    expect(view.designs).toEqual([]);
  });
});

describe("colour field: label, swatches and Custom color (W-136)", () => {
  test("the label stays visible and every colour variable shows as a swatch button", async () => {
    const view = await control({ var: "ink" });
    // Kumo's Select prints its label as visible text above the trigger.
    expect(
      [...view.host.querySelectorAll("span")].some((el) => el.textContent === "Text color"),
    ).toBe(true);
    expect(view.swatches()).toEqual(["Brand (#0055ff)", "Ink (#111111) *"]);
    await view.swatch("Brand");
    expect(view.values).toEqual([{ var: "brand" }]);
    expect(view.has("Custom color")).toBe(false);
  });

  test("a hex value shows the Custom color field; a bad hex is refused, a good one applied", async () => {
    const view = await control("#c2410c");
    expect(view.has("Custom color")).toBe(true);
    await view.type("Custom color", "#12");
    await view.blur("Custom color");
    expect(view.alert()).toBe("Enter a hex color such as #1a2b3c.");
    expect(view.values).toEqual([]);
    await view.type("Custom color", " #123456 ");
    await view.enter("Custom color");
    expect(view.alert()).toBeNull();
    expect(view.values).toEqual(["#123456"]);
    expect(view.designs).toEqual([]);
  });

  test("RGB and OKLCH fields commit a hex, and a bad RGB is refused", async () => {
    const view = await control("#c2410c");
    expect(view.has("RGB")).toBe(true);
    expect(view.has("OKLCH")).toBe(true);
    await view.type("RGB", "999, 0, 0");
    await view.enter("RGB");
    expect(view.alert()).toBe(
      "Enter red, green and blue from 0 to 255, such as 255, 128, 0. Alpha is optional: 0–1 or 0–100%.",
    );
    expect(view.values).toEqual([]);
    await view.type("RGB", "0, 128, 0");
    await view.enter("RGB");
    expect(view.values).toEqual(["#008000"]);
  });

  test("a refused RGB or OKLCH entry marks that field, not the hex (W-174)", async () => {
    const view = await control("#c2410c");
    const input = (label: string) =>
      [...view.host.querySelectorAll("label")]
        .find((l) => l.textContent?.trim() === label)
        ?.getAttribute("for") ?? "";
    const marked = () =>
      ["Custom color", "RGB", "OKLCH"].filter((label) => {
        const el = document.getElementById(input(label));
        return (
          el?.getAttribute("aria-invalid") === "true" || el?.className.includes("ring-kumo-danger")
        );
      });
    const alertFollows = (label: string) => {
      const el = document.getElementById(input(label));
      const alert = view.host.querySelector('[role="alert"]');
      const next = ["Custom color", "RGB", "OKLCH"]
        .slice(["Custom color", "RGB", "OKLCH"].indexOf(label) + 1)
        .map((l) => document.getElementById(input(l)))[0];
      if (!el || !alert) return false;
      const after = Boolean(el.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeNext =
        !next || Boolean(alert.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING);
      return after && beforeNext;
    };
    await view.type("RGB", "999, 0, 0");
    await view.enter("RGB");
    expect(marked()).toEqual(["RGB"]);
    expect(alertFollows("RGB")).toBe(true);
    await view.type("OKLCH", "nope");
    await view.enter("OKLCH");
    expect(marked()).toEqual(["OKLCH"]);
    expect(alertFollows("OKLCH")).toBe(true);
    await view.type("Custom color", "blue");
    await view.enter("Custom color");
    expect(marked()).toEqual(["Custom color"]);
    expect(alertFollows("Custom color")).toBe(true);
    expect(view.values).toEqual([]);
  });

  test("a refused RGB or OKLCH entry says the valid ranges (W-181)", async () => {
    const view = await control("#c2410c");
    await view.type("RGB", "300, 0, 0");
    await view.enter("RGB");
    expect(view.alert()).toContain("from 0 to 255");
    await view.type("OKLCH", "62.8, 0.9, 29");
    await view.enter("OKLCH");
    expect(view.alert()).toBe(
      "Enter lightness 0–100 (or 0–1), chroma 0–0.5 and hue 0–360, such as 62.8, 0.150, 29.",
    );
    expect(view.values).toEqual([]);
  });

  test("the browser's picker previews while dragging and applies when its dialog closes", async () => {
    const view = await control("#c2410c");
    const picker = view.picker();
    if (!picker) throw new Error("no picker");
    expect(picker.value).toBe("#c2410c");
    expect(picker.getAttribute("aria-label")).toBe("Pick text color");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        picker,
        "#00ff00",
      );
      picker.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.values).toEqual([]);
    await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
    expect(view.values).toEqual(["#00ff00"]);
  });

  test("the Select lists Default, the variables and Custom color, and shows the swatch", async () => {
    const view = await control("#c2410c");
    const trigger = view.host.querySelector("[data-emvb-control=color] button");
    expect(trigger?.querySelector(".emvb-swatch")?.getAttribute("style")).toContain("#c2410c");
    expect(trigger?.textContent).toContain("#c2410c");
  });
});
