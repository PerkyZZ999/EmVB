import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../../test/dom/mount.ts";
import { vnodeToReact } from "./vnode-react.tsx";

afterEach(cleanup);

describe("W-804 the canvas spells HTML attributes the way React expects", () => {
  test("fetchpriority, srcset, playsinline, autoplay and datetime render without a React warning", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const root = await mount(
        vnodeToReact({
          tag: "div",
          attrs: {},
          children: [
            {
              tag: "img",
              attrs: { src: "/a.png", alt: "A", fetchpriority: "high", srcset: "/a.png 1x" },
              children: [],
            },
            {
              tag: "video",
              attrs: { src: "/v.mp4", playsinline: "", autoplay: "", muted: "" },
              children: [],
            },
            { tag: "time", attrs: { datetime: "2026-10-20" }, children: ["Oct 20"] },
          ],
        }),
      );
      await act(async () => {});
      const messages = error.mock.calls.map((call) => call.map(String).join(" "));
      expect(messages.filter((m) => m.includes("Invalid DOM property"))).toEqual([]);
      const img = root.querySelector("img");
      expect(img?.getAttribute("fetchpriority")).toBe("high");
      expect(img?.getAttribute("srcset")).toBe("/a.png 1x");
      expect(root.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-20");
    } finally {
      error.mockRestore();
    }
  });
});
