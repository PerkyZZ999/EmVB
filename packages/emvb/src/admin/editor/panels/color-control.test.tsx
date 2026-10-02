import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { DesignSystem, StyleProps } from "../../../core/index.ts";
import { cleanup, mount, settle } from "../../../../test/dom/mount.ts";
import { ColorControl } from "./ColorControl.tsx";

afterEach(cleanup);

// W-091: colour variables were only tested through one whole-editor create test; editing a
// bound value, validation, failures and id collisions weren't checked.

const DESIGN: DesignSystem = {
  schemaVersion: 8,
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
  return { designs, values, type, blur, enter, click, alert, has };
}

describe("editing a bound colour variable (W-091)", () => {
  test("a new hex saves the design with only that variable changed", async () => {
    const view = await control({ var: "brand" });
    await view.type("Brand value", "#112233");
    await view.blur("Brand value");
    expect(view.designs).toEqual([
      {
        schemaVersion: 8,
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
