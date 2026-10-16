import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type DesignSystem } from "../../../core/index.ts";
import { cleanup, mount, rerender } from "../../../../test/dom/mount.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { VariableSection } from "./VariableSection.tsx";

afterEach(cleanup);

const onSave = async () => undefined;
const onAskDelete = () => undefined;
const names = ["Brand", "Ink", "Paper", "Accent"];
const design: DesignSystem = {
  ...emptyDesign(),
  classes: names.map((name) => ({ id: name.toLowerCase(), name, style: {} })),
  variables: {
    ...emptyDesign().variables,
    colors: names.map((name) => ({ id: name.toLowerCase(), name, value: "#112233" })),
  },
};

async function type(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Search is missing: ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

for (const kind of ["classes", "colors"] as const) {
  test(`W-707: ${kind} search stays available when an active filter has only three items left`, async () => {
    const section = (value: DesignSystem) =>
      kind === "classes" ? (
        <ClassesSection design={value} layout={null} onSave={onSave} onAskDelete={onAskDelete} />
      ) : (
        <VariableSection
          title="Colors"
          kind="color"
          design={value}
          layout={null}
          onSave={onSave}
          onAskDelete={onAskDelete}
        />
      );
    const selector = kind === "classes" ? "[data-emvb-class-def]" : "[data-emvb-var-id]";
    const label = `Search ${kind}`;
    await mount(section(design));
    await type(label, "missing");
    expect(document.querySelectorAll(selector).length).toBe(0);
    const reduced = {
      ...design,
      classes: (design.classes ?? []).slice(0, 3),
      variables: { ...design.variables, colors: design.variables.colors.slice(0, 3) },
    };
    await rerender(section(reduced));
    expect(document.querySelector(`input[aria-label="${label}"]`) !== null).toBe(true);
    await type(label, "");
    expect(document.querySelectorAll(selector).length).toBe(3);
    expect(document.querySelector(`input[aria-label="${label}"]`) === null).toBe(true);
  });
}
