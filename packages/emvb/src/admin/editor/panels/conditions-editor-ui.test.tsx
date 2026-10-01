import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { CONDITIONS_SCHEMA_VERSION, type ConditionsDoc } from "../../../core/index.ts";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { ConditionsEditor } from "./ConditionsEditor.tsx";

afterEach(cleanup);

// W-091: only the option helpers were tested; the editor's add, change and remove weren't.

const TWO: ConditionsDoc = {
  schemaVersion: CONDITIONS_SCHEMA_VERSION,
  rules: [
    { id: "r1", op: "include", group: "general", name: "entire_site", args: {} },
    { id: "r2", op: "exclude", group: "singular", name: "front", args: {} },
  ],
};

async function editor(conditions: ConditionsDoc | undefined) {
  const sent: ConditionsDoc[] = [];
  const host = await mount(
    <ConditionsEditor conditions={conditions} onChange={(doc) => sent.push(doc)} />,
  );
  const rows = () => [...host.querySelectorAll<HTMLElement>(".emvb-condition-row")];
  const choose = async (select: HTMLSelectElement | null | undefined, value: string) => {
    if (!select) throw new Error("no select");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
        select,
        value,
      );
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const press = async (name: string, within: ParentNode = host) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name,
    );
    if (!button) throw new Error(`no ${name}`);
    await act(async () => button.click());
  };
  return { host, sent, rows, choose, press };
}

describe("display conditions editor (W-091)", () => {
  test("with no rules it says the part shows nowhere, and Add Include adds an Entire site include", async () => {
    const view = await editor({ schemaVersion: CONDITIONS_SCHEMA_VERSION, rules: [] });
    expect(view.host.querySelector('[role="status"]')?.textContent ?? "").toContain(
      "this part will not appear anywhere",
    );
    await view.press("Add Include");
    expect(view.sent).toHaveLength(1);
    const doc = view.sent[0];
    expect(doc?.schemaVersion).toBe(CONDITIONS_SCHEMA_VERSION);
    expect(doc?.rules.map(({ op, group, name, args }) => ({ op, group, name, args }))).toEqual([
      { op: "include", group: "general", name: "entire_site", args: {} },
    ]);
    expect(doc?.rules[0]?.id).toMatch(/^r-/);
  });

  test("a part without conditions starts with the default Entire site include", async () => {
    const view = await editor(undefined);
    expect(view.host.querySelector('[role="status"]')).toBeNull();
    const row = view.rows()[0];
    expect(view.rows()).toHaveLength(1);
    expect(row?.querySelector<HTMLSelectElement>(".emvb-condition-op")?.value).toBe("include");
    expect(row?.querySelector<HTMLSelectElement>(".emvb-condition-where")?.value).toBe(
      "general:entire_site",
    );
  });

  test("Add Exclude appends an exclude after the existing rules", async () => {
    const view = await editor(TWO);
    expect(view.host.querySelector('[role="status"]')).toBeNull();
    await view.press("Add Exclude");
    const rules = view.sent[0]?.rules ?? [];
    expect(rules.map((r) => [r.id.startsWith("r-") ? "new" : r.id, r.op])).toEqual([
      ["r1", "include"],
      ["r2", "exclude"],
      ["new", "exclude"],
    ]);
  });

  test("switching a rule to Exclude changes only that rule", async () => {
    const view = await editor(TWO);
    await view.choose(view.rows()[0]?.querySelector(".emvb-condition-op"), "exclude");
    expect(view.sent).toEqual([
      {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [{ ...TWO.rules[0], op: "exclude" }, TWO.rules[1]],
      } as ConditionsDoc,
    ]);
  });

  test("choosing where a rule applies keeps its op and id, and changes only that rule", async () => {
    const view = await editor(TWO);
    await view.choose(
      view.rows()[1]?.querySelector(".emvb-condition-where"),
      "archive:taxonomy:tag",
    );
    expect(view.sent).toEqual([
      {
        schemaVersion: CONDITIONS_SCHEMA_VERSION,
        rules: [
          TWO.rules[0],
          {
            id: "r2",
            op: "exclude",
            group: "archive",
            name: "taxonomy",
            args: { taxonomy: "tag" },
          },
        ],
      } as ConditionsDoc,
    ]);
  });

  test("Remove condition removes only its own row", async () => {
    const view = await editor(TWO);
    const second = view.rows()[1];
    if (!second) throw new Error("no second row");
    await view.press("Remove condition", second);
    expect(view.sent).toEqual([
      { schemaVersion: CONDITIONS_SCHEMA_VERSION, rules: [TWO.rules[0]] } as ConditionsDoc,
    ]);
  });
});
