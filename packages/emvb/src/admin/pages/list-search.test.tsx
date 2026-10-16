import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { matchesSearch } from "../search.ts";
import { EditedTime } from "./list-kit.tsx";
import { PageList } from "./PageList.tsx";
import { ThemePartList } from "./ThemePartList.tsx";

afterEach(cleanup);

for (const kind of ["pages", "theme parts"] as const) {
  test(`W-725: clearing unmatched ${kind} restores results and search focus`, async () => {
    let requests = 0;
    const fetcher: Fetcher = async () => {
      requests++;
      return Response.json({
        data: {
          items: [
            {
              id: "01A",
              slug: "about",
              status: "draft",
              data: { title: "About", part_type: "header" },
            },
            {
              id: "01B",
              slug: "pricing",
              status: "draft",
              data: { title: "Pricing", part_type: "footer" },
            },
          ],
        },
      });
    };
    const host = await mount(
      kind === "pages" ? <PageList fetcher={fetcher} /> : <ThemePartList fetcher={fetcher} />,
    );
    await settle();
    if (kind === "theme parts") {
      await act(async () =>
        host.querySelector<HTMLButtonElement>("#emvb-theme-filter-header")?.click(),
      );
    }
    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "zzz");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("[data-emvb-no-matches][role=status]")?.textContent).toContain("zzz");
    const clear = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Clear search",
    );
    expect(clear !== undefined).toBe(true);
    clear?.focus();
    await act(async () => clear?.click());
    expect(input?.value).toBe("");
    expect(document.activeElement === input).toBe(true);
    expect(host.querySelector("[data-emvb-no-matches]")?.outerHTML).toBeUndefined();
    expect(
      [...host.querySelectorAll("[data-emvb-row]")].map((row) => row.getAttribute("data-emvb-row")),
    ).toEqual(kind === "pages" ? ["01A", "01B"] : ["01A"]);
    if (kind === "theme parts") {
      expect(host.querySelector("#emvb-theme-filter-header")?.getAttribute("aria-selected")).toBe(
        "true",
      );
    }
    expect(requests).toBe(1);
  });
}

describe("list search (W-207)", () => {
  test("every word must match a field, ignoring case and accents", () => {
    expect(matchesSearch("about us", "About Us", "/about-us")).toBe(true);
    expect(matchesSearch("CAFE", "Café menu")).toBe(true);
    expect(matchesSearch("about pricing", "About", "/about")).toBe(false);
    expect(matchesSearch("   ", "Anything")).toBe(true);
    expect(matchesSearch("%_<script>", "About")).toBe(false);
  });

  test("typing in Visual pages filters the rows and says when nothing matches", async () => {
    const fetcher: Fetcher = async () =>
      Response.json({
        data: {
          items: [
            { id: "01A", slug: "about", status: "draft", data: { title: "About" } },
            { id: "01B", slug: "pricing", status: "draft", data: { title: "Pricing" } },
          ],
        },
      });
    await mount(<PageList fetcher={fetcher} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const input = document.querySelector<HTMLInputElement>('input[type="search"]');
    expect(input).toBeTruthy();
    const type = async (value: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await type("pric");
    expect(
      [...document.querySelectorAll("[data-emvb-row]")].map((r) => r.getAttribute("data-emvb-row")),
    ).toEqual(["01B"]);
    await type("zzz");
    expect(document.querySelector("[data-emvb-no-matches]")?.textContent).toContain("zzz");
  });
});

test("W-685: an unreadable edited time shows nothing instead of breaking the list", async () => {
  const host = await mount(<EditedTime iso="not a date" />);
  expect(host.querySelector("time")?.textContent).toBe("");
});
