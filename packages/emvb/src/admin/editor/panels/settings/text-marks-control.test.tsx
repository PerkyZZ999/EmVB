import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";
import { ElementPanel } from "../ElementPanel.tsx";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(cleanup);

let changes: LayoutNode[] = [];
afterEach(() => {
  changes = [];
});

async function panel(node: LayoutNode) {
  const layout = {
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children: [node] },
  } as Layout;
  await mount(
    <ElementPanel
      node={node}
      layout={layout}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      onChange={(next) => changes.push(next)}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />,
  );
  await settle();
}

const textField = () =>
  document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
    '[data-emvb-field="text"] textarea, input[data-emvb-field="text"], [data-emvb-field="text"] input',
  );
const select = (start: number, end: number) => textField()?.setSelectionRange(start, end);
const press = async (name: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  );
  if (!button) throw new Error(`${name} is missing`);
  await act(async () => button.click());
  await settle();
};
const status = () =>
  document.querySelector('[data-emvb-field="marks"] [role="status"]')?.textContent;
const text = (props: Record<string, unknown>) =>
  ({
    id: "text0001",
    type: "text",
    props: { text: "Fast pages, no code.", ...props },
  }) as LayoutNode;

test("W-950: Bold on selected words formats them; again takes it off", async () => {
  await panel(text({}));
  select(0, 4);
  await press("Bold");
  expect(changes.at(-1)?.props).toMatchObject({ marks: [{ start: 0, end: 4, bold: true }] });

  await cleanup();
  await panel(text({ marks: [{ start: 0, end: 4, bold: true }] }));
  expect(document.querySelector(".emvb-marks-list")?.textContent).toContain("“Fast” Bold");
  select(0, 4);
  await press("Bold");
  expect(changes.at(-1)?.props).not.toHaveProperty("marks");
});

test("W-950: a link goes on the selected words; an unsafe one is refused", async () => {
  await panel(text({}));
  select(12, 19);
  await press("Link");
  const input = [...document.querySelectorAll("label")].find(
    (l) => l.textContent === 'Link for "no code"',
  )?.control as HTMLInputElement | null;
  if (!input) throw new Error("link field is missing");
  const type = async (value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await type("javascript:alert(1)");
  await press("Apply link");
  expect(changes).toHaveLength(0);
  expect(status()).toContain("Enter a link such as /contact");
  await type("/start");
  await press("Apply link");
  expect(changes.at(-1)?.props).toMatchObject({ marks: [{ start: 12, end: 19, href: "/start" }] });
});

test("W-950: nothing selected says so; Remove takes one format off", async () => {
  await panel(text({ marks: [{ start: 5, end: 10, italic: true }] }));
  select(3, 3);
  await press("Bold");
  expect(status()).toBe("Select some words in the Text field first.");
  expect(changes).toHaveLength(0);
  await press('Remove formatting from "pages"');
  expect(changes.at(-1)?.props).not.toHaveProperty("marks");
});

test("W-950: a linked heading offers no word links", async () => {
  await panel({
    id: "head0001",
    type: "heading",
    props: { text: "Hello", level: 2, href: "/home" },
  } as LayoutNode);
  expect(document.querySelector('[data-emvb-field="marks"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Link"]')).toBeNull();
});
