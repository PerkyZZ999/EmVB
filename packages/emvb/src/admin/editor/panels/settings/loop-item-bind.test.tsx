import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Fetcher } from "../../../api.ts";
import { LoopItemBindControl } from "./LoopItemBindControl.tsx";

let root: Root | undefined;
let host: HTMLElement | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  document.body.innerHTML = "";
});

async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("LoopItemBindControl (W-077)", () => {
  test("shows Loop Item picker when theme parts include loop_item", async () => {
    const fetcher: Fetcher = async (path) => {
      if (path.includes("/content/emvb_theme_parts")) {
        return new Response(
          JSON.stringify({
            data: {
              items: [
                {
                  id: "loop0001",
                  status: "published",
                  updatedAt: "2026-09-27T00:00:00Z",
                  data: { title: "Card item", part_type: "loop_item" },
                },
                {
                  id: "head0001",
                  status: "published",
                  updatedAt: "2026-09-27T00:00:00Z",
                  data: { title: "Site header", part_type: "header" },
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 404 });
    };
    await mount(<LoopItemBindControl value="" fetcher={fetcher} onChange={() => undefined} />);
    await flush();
    expect(document.querySelector('[data-emvb-loop-item-bind="list"]')).toBeTruthy();
    expect(document.querySelector('[data-emvb-loop-item-bind="manual"]')).toBeNull();
  });

  test("falls back to manual id when list is empty or fails", async () => {
    const fetcher: Fetcher = async () =>
      new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "no" } }), {
        status: 403,
      });
    await mount(
      <LoopItemBindControl value="paste-me" fetcher={fetcher} onChange={() => undefined} />,
    );
    await flush();
    expect(document.querySelector('[data-emvb-loop-item-bind="manual"]')).toBeTruthy();
    expect((document.querySelector("input") as HTMLInputElement | null)?.value).toBe("paste-me");
  });
});
