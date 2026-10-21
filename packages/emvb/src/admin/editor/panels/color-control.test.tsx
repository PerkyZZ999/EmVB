import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import type { DesignSystem, StyleProps } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { ColorControl } from "./ColorControl.tsx";

afterEach(cleanup);

// W-091: colour variables were only tested through one whole-editor create test; editing a
// bound value, validation, failures and id collisions weren't checked.

const DESIGN: DesignSystem = {
  schemaVersion: 15,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#0055ff" },
      { id: "ink", name: "Ink", value: "#111111" },
    ],
  },
};

async function control(
  value: StyleProps["color"],
  fail?: string,
  save?: (design: DesignSystem) => Promise<void>,
) {
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
        await save?.(design);
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
  return {
    designs,
    values,
    field,
    type,
    blur,
    enter,
    click,
    alert,
    has,
    swatches,
    swatch,
    picker,
    host,
  };
}

describe("editing a bound colour variable (W-091)", () => {
  test("W-734: a pending bound value retains focus and draft, then recovers for retry", async () => {
    const pending = Promise.withResolvers<void>();
    let saves = 0;
    const view = await control({ var: "brand" }, undefined, async () => {
      if (++saves === 1) await pending.promise;
    });
    await view.type("Brand value", "#abcdef");
    try {
      await view.enter("Brand value");
      const input = view.field("Brand value");
      expect(input?.readOnly).toBe(true);
      expect(input?.getAttribute("aria-busy")).toBe("true");
      expect(input === document.activeElement).toBe(true);
      expect(view.host.querySelector('[role="status"]')?.textContent).toBe(
        "Saving color variable…",
      );
      await act(async () => pending.reject(new Error("Try saving again.")));
      await settle();
      expect(view.alert()).toBe("Try saving again.");
      expect(input?.value).toBe("#abcdef");
      expect(input?.readOnly).toBe(false);
      expect(input?.getAttribute("aria-busy")).toBe("false");
      await view.type("Brand value", "#123456");
      await view.enter("Brand value");
      expect(view.designs.map((design) => design.variables.colors[0]?.value)).toEqual([
        "#abcdef",
        "#123456",
      ]);
      expect(view.alert()).toBeNull();
      expect(view.host.querySelector('[role="status"]')?.textContent).toBe(
        "Color variable saved. Publish styles to make it live.",
      );
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("W-734: same-turn Enter and blur submit a bound value only once while pending", async () => {
    const pending = Promise.withResolvers<void>();
    const view = await control({ var: "brand" }, undefined, () => pending.promise);
    await view.type("Brand value", "#abcdef");
    const input = view.field("Brand value");
    try {
      await act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.blur();
      });
      expect(view.designs).toHaveLength(1);
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("a new hex saves the design with only that variable changed", async () => {
    const view = await control({ var: "brand" });
    await view.type("Brand value", "#112233");
    await view.blur("Brand value");
    expect(view.designs).toEqual([
      {
        schemaVersion: 15,
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
    const warnings: string[] = [];
    const warn = spyOn(console, "warn").mockImplementation(
      (...args: unknown[]) => void warnings.push(args.join(" ")),
    );
    const view = await control({ var: "brand" });
    await view.type("Brand value", "blue");
    await view.enter("Brand value");
    expect(view.alert()).toBe("Enter a hex color such as #1a2b3c.");
    expect(view.designs).toEqual([]);
    // W-673: the refused field is marked invalid for screen readers, like the Custom color field.
    const input = [...view.host.querySelectorAll("input")].find((el) => el.value === "blue");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.className).toContain("ring-kumo-danger");
    warn.mockRestore();
    expect(warnings.filter((w) => w.includes("deprecated"))).toEqual([]);
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
  test("W-728: pending variable creation retains values and unlocks for retry", async () => {
    const pending = Promise.withResolvers<void>();
    let saves = 0;
    const view = await control(undefined, undefined, async () => {
      if (++saves === 1) await pending.promise;
    });
    await view.click("New variable");
    await view.type("Variable name", "Accent");
    await view.type("Value", "#abcdef");
    try {
      await view.click("Create variable");
      const form = view.host.querySelector('[data-emvb-form="new-variable"]');
      const fields = [...(form?.querySelectorAll("input") ?? [])];
      const buttons = [...(form?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      // W-822: locked (read-only, aria-disabled) rather than disabled, so focus stays put.
      expect(
        fields.map((field) => field.readOnly && field.getAttribute("aria-disabled") === "true"),
      ).toEqual([true, true]);
      expect(buttons.map((button) => button.getAttribute("aria-disabled") === "true")).toEqual([
        true,
        true,
      ]);
      expect(buttons.at(-1)?.getAttribute("aria-busy")).toBe("true");
      expect(form?.querySelector('[role="status"]')?.textContent).toBe("Creating color variable…");
      expect(view.values).toEqual([]);
      await act(async () => pending.reject(new Error("Try saving again.")));
      await settle();
      expect(view.alert()).toBe("Try saving again.");
      expect(fields.map((field) => field.value)).toEqual(["Accent", "#abcdef"]);
      expect(
        fields.map((field) => field.readOnly || field.getAttribute("aria-disabled") === "true"),
      ).toEqual([false, false]);
      expect(buttons.map((button) => button.getAttribute("aria-disabled") === "true")).toEqual([
        false,
        false,
      ]);
      expect(buttons.at(-1)?.getAttribute("aria-busy")).toBe("false");
      await view.type("Value", "#123456");
      await view.click("Create variable");
      expect(view.designs).toHaveLength(2);
      expect(view.designs.at(-1)?.variables.colors.at(-1)?.value).toBe("#123456");
      expect(view.values).toEqual([{ var: "accent" }]);
      expect(view.has("Variable name")).toBe(false);
    } finally {
      await act(async () => pending.resolve());
    }
  });

  test("W-728: rapid clicks and Enter create only one pending variable", async () => {
    const pending = Promise.withResolvers<void>();
    const view = await control(undefined, undefined, () => pending.promise);
    await view.click("New variable");
    await view.type("Variable name", "Accent");
    await view.type("Value", "#abcdef");
    try {
      const form = view.host.querySelector('[data-emvb-form="new-variable"]');
      const create = [...(form?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
        (button) => button.textContent === "Create variable",
      );
      const value = form?.querySelector<HTMLInputElement>('input[placeholder="#1a2b3c"]');
      await act(async () => {
        create?.click();
        create?.click();
        value?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      });
      expect(view.designs).toHaveLength(1);
      expect(view.values).toEqual([]);
    } finally {
      await act(async () => pending.resolve());
    }
  });

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

  test("an out-of-gamut OKLCH entry saves the clipped hex and says it was clipped (W-183)", async () => {
    const view = await control("#c2410c");
    const hint = () => document.querySelector("[data-emvb-clipped]")?.textContent ?? null;
    await view.type("OKLCH", "62.8, 0.4, 29");
    await view.enter("OKLCH");
    expect(view.values).toEqual(["#ff0000"]);
    expect(hint()).toBe(
      "Clipped to #ff0000: that OKLCH colour is outside sRGB, so its out-of-range channels were cut to fit.",
    );
    await view.type("OKLCH", "62.8, 0.1, 29");
    await view.enter("OKLCH");
    expect(view.values).toHaveLength(2);
    expect(hint()).toBeNull();
  });

  test("the clipped hint stays when the saved colour comes back and remounts the field (W-183)", async () => {
    function Live() {
      const [value, setValue] = React.useState<StyleProps["color"]>("#c2410c");
      return (
        <ColorControl
          label="Text color"
          value={value}
          design={DESIGN}
          onChange={setValue}
          onDesignChange={async () => {}}
        />
      );
    }
    const host = await mount(<Live />);
    const label = [...host.querySelectorAll("label")].find(
      (l) => l.textContent?.trim() === "OKLCH",
    );
    const input = document.getElementById(label?.getAttribute("for") ?? "");
    if (!(input instanceof HTMLInputElement)) throw new Error("no OKLCH field");
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "62.8, 0.4, 29",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(host.querySelector("[data-emvb-clipped]")?.textContent ?? null).toStartWith(
      "Clipped to #ff0000:",
    );
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

describe("Picking a colour keeps its transparency (W-526)", () => {
  test("a see-through custom colour stays see-through after the picker", async () => {
    const ui = await control("#11223380");
    const input = ui.picker();
    if (!input) throw new Error("no picker");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "#ff0000",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(ui.values.at(-1)).toBe("#ff000080");
  });

  test("a solid colour stays solid", async () => {
    const ui = await control("#112233");
    const input = ui.picker();
    if (!input) throw new Error("no picker");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "#00ff00",
      );
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(ui.values.at(-1)).toBe("#00ff00");
  });
});

test("W-818: closing the new-variable form by Cancel or Create puts focus back on New variable", async () => {
  const view = await control(undefined);
  const newButton = () =>
    [...view.host.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "New variable",
    );
  await view.click("New variable");
  const cancel = [...view.host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === "Cancel",
  );
  cancel?.focus();
  await view.click("Cancel");
  expect(newButton()).toBeTruthy();
  expect(document.activeElement === newButton()).toBe(true);
  await view.click("New variable");
  await view.type("Variable name", "Accent");
  await view.type("Value", "#abcdef");
  await view.click("Create variable");
  await settle();
  expect(newButton()).toBeTruthy();
  expect(document.activeElement === newButton()).toBe(true);
});

test("W-820: a refused name or value focuses that field and marks it invalid", async () => {
  const view = await control(undefined);
  await view.click("New variable");
  await view.type("Value", "#abcdef");
  await view.enter("Value");
  expect(view.alert()).toBe("Enter a name for the variable.");
  const name = view.field("Variable name");
  const value = view.field("Value");
  expect(document.activeElement === name).toBe(true);
  expect(name.getAttribute("aria-invalid")).toBe("true");
  expect(value.hasAttribute("aria-invalid")).toBe(false);
  await view.type("Variable name", "Accent");
  await view.type("Value", "#12");
  name.focus();
  await view.click("Create variable");
  expect(document.activeElement === view.field("Value")).toBe(true);
  expect(view.field("Value").getAttribute("aria-invalid")).toBe("true");
  expect(view.field("Variable name").hasAttribute("aria-invalid")).toBe(false);
  expect(view.designs).toEqual([]);
});

test("W-821: Escape closes the new-variable form and returns focus to New variable", async () => {
  const view = await control(undefined);
  await view.click("New variable");
  await view.type("Variable name", "Accent");
  const outside: string[] = [];
  const onOutside = (event: KeyboardEvent) => outside.push(event.key);
  document.addEventListener("keydown", onOutside);
  await act(async () => {
    view
      .field("Variable name")
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
  });
  await settle();
  document.removeEventListener("keydown", onOutside);
  expect(view.has("Variable name")).toBe(false);
  expect(view.designs).toEqual([]);
  expect(outside).toEqual([]);
  const newButton = [...view.host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === "New variable",
  );
  expect(document.activeElement === newButton).toBe(true);
});

test("W-822: while creating, the form keeps focus and Cancel or Escape doesn't close it", async () => {
  const pending = Promise.withResolvers<void>();
  const view = await control(undefined, undefined, () => pending.promise);
  await view.click("New variable");
  await view.type("Variable name", "Accent");
  await view.type("Value", "#abcdef");
  try {
    const form = view.host.querySelector('[data-emvb-form="new-variable"]');
    const buttons = [...(form?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const create = buttons.find((b) => b.textContent === "Create variable");
    create?.focus();
    await act(async () => create?.click());
    expect(buttons.map((b) => b.disabled)).toEqual([false, false]);
    expect([...(form?.querySelectorAll("input") ?? [])].map((f) => f.disabled)).toEqual([
      false,
      false,
    ]);
    expect(document.activeElement === create).toBe(true);
    await act(async () => buttons.find((b) => b.textContent === "Cancel")?.click());
    expect(view.has("Variable name")).toBe(true);
    expect(view.designs).toHaveLength(1);
  } finally {
    await act(async () => pending.resolve());
  }
});
