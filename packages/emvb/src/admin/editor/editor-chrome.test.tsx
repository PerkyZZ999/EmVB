import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import { useChromeFlags } from "./editor-chrome.tsx";

afterEach(cleanup);

function Probe() {
  const chrome = useChromeFlags();
  const open = Object.entries(chrome.flags)
    .filter(([, value]) => value)
    .map(([key]) => key);
  return (
    <p
      data-open={open.length === 0 ? "none" : open.join(",")}
      data-leaving={String(chrome.leaving)}
    />
  );
}

describe("editor chrome (W-363)", () => {
  test("dialogs start closed", async () => {
    await mount(<Probe />);
    const probe = document.querySelector("p");
    expect(probe?.getAttribute("data-open")).toBe("none");
    expect(probe?.getAttribute("data-leaving")).toBe("false");
  });
});

describe("focus after a palette-opened dialog (W-831)", () => {
  function Harness() {
    const chrome = useChromeFlags();
    const [closing, setClosing] = React.useState(false);
    return (
      <div>
        <button type="button" className="emvb-layer-select" aria-current="true">
          Heading
        </button>
        <button type="button" data-open="" onClick={() => chrome.open("share")}>
          open
        </button>
        {(chrome.flags.share || closing) && (
          <div role="dialog">
            <button
              type="button"
              data-close=""
              onClick={() => {
                // Like Kumo's Dialog: focus stays inside while the close animation runs.
                setClosing(true);
                chrome.close("share");
                setTimeout(() => setClosing(false), 60);
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    );
  }
  const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  test("W-831: closing it with focus left on the page body focuses the selected layer", async () => {
    await mount(<Harness />);
    await act(async () => document.querySelector<HTMLElement>("[data-open]")?.click());
    const close = document.querySelector<HTMLElement>("[data-close]");
    close?.focus();
    await act(async () => close?.click());
    await wait(20);
    expect(document.activeElement === close).toBe(true);
    await wait(100);
    await wait(100);
    expect(document.activeElement?.textContent).toBe("Heading");
  });

  test("W-831: focus that went somewhere on purpose is left alone", async () => {
    await mount(<Harness />);
    const opener = document.querySelector<HTMLElement>("[data-open]");
    await act(async () => opener?.click());
    await act(async () => document.querySelector<HTMLElement>("[data-close]")?.click());
    opener?.focus();
    await wait(150);
    expect(document.activeElement === opener).toBe(true);
  });
});
