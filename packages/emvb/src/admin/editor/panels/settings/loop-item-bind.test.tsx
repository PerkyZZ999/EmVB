import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../../../api.ts";
import { EditorHostContext } from "../../host.ts";
import { LoopItemBindControl } from "./LoopItemBindControl.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";

afterEach(cleanup);

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
    expect(
      document.querySelector('[data-emvb-loop-item-bind="manual"]')?.outerHTML ?? null,
    ).toBeNull();
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

describe("admin links outside the EmDash admin (W-289)", () => {
  const failing: Fetcher = async () => new Response("{}", { status: 500 });
  const adminHrefs = () =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");

  test("in the admin, the empty Loop Item binder links to the Theme Builder", async () => {
    await mount(<LoopItemBindControl value="" fetcher={failing} onChange={() => undefined} />);
    await flush();
    expect(adminHrefs()).toEqual(["/_emdash/admin/plugins/emvb/theme"]);
  });

  test("a host without the admin (the playground) gets no Theme Builder link", async () => {
    await mount(
      <EditorHostContext.Provider
        value={{
          exit: () => undefined,
          back: { label: "x", go: () => undefined },
          adminLinks: false,
        }}
      >
        <LoopItemBindControl value="" fetcher={failing} onChange={() => undefined} />
      </EditorHostContext.Provider>,
    );
    await flush();
    expect(adminHrefs()).toEqual([]);
    expect(document.body.textContent).toContain("Paste a theme-part id.");
    expect(document.body.textContent).not.toContain("Theme Builder");
  });
});
