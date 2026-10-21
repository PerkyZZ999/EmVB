import { afterEach, describe, expect, test } from "bun:test";
import { act, useEffect, useRef, type SyntheticEvent } from "react";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { EDITOR_CSS } from "../editor-css.ts";
import { useFrameFocusRing } from "./frame-focus-ring.ts";

afterEach(cleanup);

function Probe() {
  const ring = useFrameFocusRing();
  const el = useRef<HTMLIFrameElement>(null);
  const { watch } = ring;
  useEffect(() => {
    if (el.current) watch({ currentTarget: el.current } as SyntheticEvent<HTMLIFrameElement>);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- watch once, as the frame loads once
  }, []);
  return <iframe ref={el} title="Page canvas" data-ring={ring.ring ? "on" : "off"} />;
}

const fire = async (target: EventTarget | null | undefined, type: string) =>
  act(async () => {
    target?.dispatchEvent(new Event(type));
  });

describe("W-809 the canvas frame shows a keyboard focus ring", () => {
  test("focus that doesn't come from a press shows the ring; blur clears it", async () => {
    const host = await mount(<Probe />);
    const frame = host.querySelector("iframe");
    expect(frame?.dataset["ring"]).toBe("off");
    await fire(frame?.contentWindow, "focus");
    expect(frame?.dataset["ring"]).toBe("on");
    await fire(frame?.contentWindow, "blur");
    expect(frame?.dataset["ring"]).toBe("off");
  });

  test("a press inside the page focuses it without a ring", async () => {
    const host = await mount(<Probe />);
    const frame = host.querySelector("iframe");
    await fire(frame?.contentDocument, "pointerdown");
    await fire(frame?.contentWindow, "focus");
    expect(frame?.dataset["ring"]).toBe("off");
  });

  test("the ring is drawn in the brand colour inside the frame", () => {
    expect(EDITOR_CSS).toContain(
      'iframe[data-emvb-canvas-focus="keyboard"] { outline: 2px solid var(--color-kumo-brand); outline-offset: -2px; }',
    );
  });
});
