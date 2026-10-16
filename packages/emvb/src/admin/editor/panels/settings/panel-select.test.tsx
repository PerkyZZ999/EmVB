import { afterEach, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, mount, rerender } from "../../../../../test/dom/mount.ts";
import { pickOption } from "../../../../../test/dom/select.ts";
import { PanelSelect } from "./PanelSelect.tsx";

afterEach(cleanup);

const OPTIONS = [
  { value: "type", label: "Type scale" },
  { value: "space", label: "Spacing scale" },
];

test("UX-005: a panel select is a labelled Kumo combobox that reports the picked value", async () => {
  const picked: string[] = [];
  const view = (value: string) => (
    <>
      <span id="scale-label">Scale</span>
      <PanelSelect
        labelledBy="scale-label"
        value={value}
        options={OPTIONS}
        data={{ "data-scale": "" }}
        onChange={(next) => picked.push(next)}
      />
    </>
  );
  const host = await mount(view("type"));
  const wrapper = host.querySelector<HTMLElement>("[data-scale]");
  const box = wrapper?.querySelector('[role="combobox"]');
  expect(box?.getAttribute("aria-labelledby") ?? null).toBe("scale-label");
  expect(box?.textContent ?? null).toBe("Type scale");
  expect(wrapper?.dataset["value"] ?? null).toBe("type");
  await pickOption(wrapper, "space");
  expect(picked).toEqual(["space"]);
  await rerender(view("space"));
  expect(wrapper?.dataset["value"] ?? null).toBe("space");
});

test("UX-005: without a visible label the trigger carries its own name", async () => {
  const host = await mount(
    <PanelSelect label="Where" value="type" options={OPTIONS} onChange={() => undefined} />,
  );
  expect(host.querySelector('[role="combobox"]')?.getAttribute("aria-label") ?? null).toBe("Where");
});

test("UX-005: the editor panels use Kumo selects, not native ones", () => {
  const root = join(import.meta.dir, "../..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx"))
        if (/<select[\s>]/.test(readFileSync(path, "utf8")))
          offenders.push(path.slice(root.length));
    }
  };
  walk(root);
  expect(offenders).toEqual([]);
});
