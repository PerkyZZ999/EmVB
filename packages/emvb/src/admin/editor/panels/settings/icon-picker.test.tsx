import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });

afterEach(cleanup);

const layout = {
  schemaVersion: 10 as const,
  root: {
    id: "root0001",
    type: "container" as const,
    props: {},
    children: [
      {
        id: "icon0001",
        type: "icon" as const,
        props: { iconId: "star", title: "Star", decorative: false, size: 24 },
      },
    ],
  },
};

describe("IconPicker title sync", () => {
  test("picking Heart updates iconId and title together (no leftover Star)", async () => {
    const first = layout.root.children[0];
    if (!first) throw new Error("expected icon child");
    let current: LayoutNode = first;

    const panel = () => (
      <ElementPanel
        node={current}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(node) => {
          current = node;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />
    );

    await mount(panel());
    const heart = document.querySelector<HTMLButtonElement>('[data-emvb-icon-id="heart"]');
    expect(heart).toBeTruthy();
    await act(async () => heart?.click());
    await mount(panel());

    expect(current.props).toMatchObject({ iconId: "heart", title: "Heart" });
    const titleInput = [...document.querySelectorAll("label")]
      .find((label) => label.textContent?.trim().startsWith("Title"))
      ?.getAttribute("for");
    const title = titleInput ? document.getElementById(titleInput) : null;
    expect((title as HTMLInputElement | null)?.value).toBe("Heart");
    expect(
      document.querySelector('[data-emvb-icon-id="heart"]')?.getAttribute("data-selected"),
    ).toBe("true");
  });

  test("a custom title is kept when picking a different icon", async () => {
    let current: LayoutNode = {
      id: "icon0001",
      type: "icon",
      props: { iconId: "star", title: "Favourite", decorative: false, size: 24 },
    };

    await mount(
      <ElementPanel
        node={current}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={(node) => {
          current = node;
        }}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    const heart = document.querySelector<HTMLButtonElement>('[data-emvb-icon-id="heart"]');
    await act(async () => heart?.click());
    expect(current.props).toMatchObject({ iconId: "heart", title: "Favourite" });
  });
});
