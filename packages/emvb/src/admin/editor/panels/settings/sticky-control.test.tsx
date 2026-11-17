import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type FlatStyleProps } from "../../../../core/index.ts";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { StickyControl } from "./StickyControl.tsx";
import { keysFor } from "./style-sections.ts";

afterEach(cleanup);

describe("When the page scrolls (W-1070)", () => {
  test("Position offers it for sticky and fixed elements, or when it is set", () => {
    const shows = (position: FlatStyleProps["position"], style?: FlatStyleProps) =>
      keysFor("container", "position", style, position).includes("stickyMotion");
    expect([shows("sticky"), shows("fixed"), shows("static"), shows("relative")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(shows("static", { stickyMotion: { shadow: true } })).toBe(true);
  });

  test("switches build the value; turning the last effect off clears it", async () => {
    const sent: unknown[] = [];
    const view = (value: FlatStyleProps["stickyMotion"]) =>
      mount(
        <StickyControl
          value={value}
          design={emptyDesign()}
          onChange={(next) => sent.push(next)}
          onDesignChange={async () => undefined}
          reset={null}
        />,
      );
    const toggle = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find((el) =>
        (el.closest(".emvb-field-group")?.textContent ?? "").includes(name),
      );
    await view(undefined);
    await act(async () => toggle("Hide while scrolling down")?.click());
    expect(sent.at(-1)).toEqual({ hide: true });
    await view({ hide: true, distance: 200 });
    await act(async () => toggle("Hide while scrolling down")?.click());
    expect(sent.at(-1)).toBeUndefined();
    await view({ hide: true });
    await act(async () => toggle("Shadow once scrolled")?.click());
    expect(sent.at(-1)).toEqual({ hide: true, shadow: true });
  });
});
