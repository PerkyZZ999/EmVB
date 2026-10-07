import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { matchesSearch } from "./list-kit.tsx";
import { PageList } from "./PageList.tsx";

afterEach(cleanup);

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
