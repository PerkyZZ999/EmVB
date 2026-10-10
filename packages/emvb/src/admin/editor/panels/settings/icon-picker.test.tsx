import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount, settle } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(cleanup);

// W-236: the Icon field opens the icon library; inserting keeps the old title rule (W-025).

const iconNode = (props: Record<string, unknown>): LayoutNode =>
  ({
    id: "icon0001",
    type: "icon",
    props: { decorative: false, size: 24, ...props },
  }) as LayoutNode;

const layoutWith = (node: LayoutNode) => ({
  schemaVersion: 14 as const,
  root: { id: "root0001", type: "container" as const, props: {}, children: [node] },
});

async function until<T>(read: () => T | null | undefined, what: string): Promise<T> {
  for (let i = 0; i < 200; i += 1) {
    const value = read();
    if (value) return value;
    // oxlint-disable-next-line no-await-in-loop -- polling: each check waits for the last render
    await settle();
  }
  throw new Error(`timed out waiting for ${what}`);
}

const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

async function mountPanel(start: LayoutNode) {
  const state = { current: start };
  const panel = () => (
    <ElementPanel
      node={state.current}
      layout={layoutWith(start)}
      design={emptyDesign()}
      rejection={null}
      fetcher={stubFetcher}
      onChange={(node) => {
        state.current = node;
      }}
      onDesignChange={async () => undefined}
      onSelect={() => undefined}
    />
  );
  await mount(panel());
  return { state, remount: () => mount(panel()) };
}

async function pickInLibrary(search: string, iconId: string, category?: string) {
  const open = document.querySelector<HTMLButtonElement>("[data-emvb-icon-open]");
  if (!open) throw new Error("no Choose button");
  await act(async () => open.click());
  const input = await until(
    () => document.querySelector<HTMLInputElement>('[data-emvb-dialog="icon-library"] input'),
    "the library search",
  );
  if (category) {
    const button = document.querySelector<HTMLButtonElement>(
      `[data-emvb-icon-category="${category}"]`,
    );
    await act(async () => button?.click());
  }
  await type(input, search);
  const tile = await until(
    () => document.querySelector<HTMLElement>(`[data-emvb-icon-id="${iconId}"]`),
    iconId,
  );
  await act(async () => tile.click());
  const insert = document.querySelector<HTMLButtonElement>("[data-emvb-icon-insert]");
  await act(async () => insert?.click());
  await settle();
}

describe("Icon field and library (W-236)", () => {
  test("a stored bundled icon shows as Lucide; inserting Heart stores id, SVG and title", async () => {
    const { state, remount } = await mountPanel(iconNode({ iconId: "star", title: "Star" }));
    const current = document.querySelector("[data-emvb-icon-current]");
    expect(current?.textContent).toContain("Star");
    expect(current?.textContent).toContain("Lucide");
    expect(current?.querySelector("svg")).toBeTruthy();

    await pickInLibrary("heart", "lucide:heart");
    expect(state.current.props).toMatchObject({ iconId: "lucide:heart", title: "Heart" });
    const svg = (state.current.props as { iconSvg?: string }).iconSvg ?? "";
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('stroke="currentColor"');
    expect(document.querySelector('[data-emvb-dialog="icon-library"]')).toBeNull();

    await remount();
    const titleFor = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.trim().startsWith("Title"))
      ?.getAttribute("for");
    const title = titleFor ? document.getElementById(titleFor) : null;
    expect((title as HTMLInputElement | null)?.value).toBe("Heart");
    expect(document.querySelector("[data-emvb-icon-current]")?.textContent).toContain("Heart");
  });

  test("a custom title is kept when inserting a different icon", async () => {
    const { state } = await mountPanel(iconNode({ iconId: "star", title: "Favourite" }));
    await pickInLibrary("heart", "lucide:heart");
    expect(state.current.props).toMatchObject({ iconId: "lucide:heart", title: "Favourite" });
  });

  test("a title that is still the old library icon's name follows the new icon", async () => {
    const { state } = await mountPanel(
      iconNode({
        iconId: "fa-solid:rocket",
        iconSvg: "<svg viewBox='0 0 512 512'><path d='M0 0h1'/></svg>",
        title: "rocket",
      }),
    );
    expect(document.querySelector("[data-emvb-icon-current]")?.textContent).toContain(
      "Font Awesome · Solid",
    );
    await pickInLibrary("anchor", "tabler:anchor", "tabler");
    expect(state.current.props).toMatchObject({ iconId: "tabler:anchor", title: "Anchor" });
  });
});

describe("an uploaded icon in the field (W-239)", () => {
  test("is named by its title and sourced from My uploads", async () => {
    await mountPanel(
      iconNode({
        iconId: "upload:aaaa000011112222",
        title: "Brand logo",
        iconSvg: '<svg viewBox="0 0 10 10"><path d="M0 0h10" fill="#e11d48"/></svg>',
      }),
    );
    const current = await until(
      () => document.querySelector("[data-emvb-icon-current]"),
      "the icon field",
    );
    expect(current.querySelector("strong")?.textContent).toBe("Brand logo");
    expect(current.textContent).toContain("My uploads");
    expect(current.querySelector(".emvb-icon-current-preview")?.getAttribute("aria-label")).toBe(
      "Change icon (now Brand logo)",
    );
  });
});
