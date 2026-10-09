import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { entryIdFromLocation, LayoutField } from "./LayoutField.tsx";
import { cleanup, mount } from "../../../test/dom/mount.ts";

const initialUrl = window.location.href;
let host: HTMLElement;

async function render(value: unknown, pathname = "/_emdash/admin/content/emvb_pages/01ABC") {
  window.history.replaceState(null, "", pathname);
  const onChange = mock(() => {});
  host = await mount(
    <LayoutField value={value} onChange={onChange} label="Layout" id="field-layout" />,
  );
  return onChange;
}

afterEach(async () => {
  await cleanup();
  window.history.replaceState(null, "", initialUrl);
});

describe("read-only layout widget (D-019)", () => {
  test("summarises the page and links to the editor for this entry", async () => {
    await render(s1Page());
    expect(host.textContent).toContain("2 elements · schema 13");
    const link = host.querySelector("a");
    expect(link?.textContent).toBe("Open in EmVB");
    expect(link?.getAttribute("href")).toBe("/_emdash/admin/plugins/emvb/editor?entry=01ABC");
  });

  test("renders no editable control and never calls onChange, even when used", async () => {
    const onChange = await render(JSON.stringify(s1Page()));
    expect(host.querySelectorAll("input, textarea, select, [contenteditable]").length).toBe(0);
    await act(async () => {
      host
        .querySelector("a")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      host.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
      host.dispatchEvent(new Event("paste", { bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an empty or damaged value shows a neutral summary", async () => {
    await render(null);
    expect(host.textContent).toContain("This page has no content yet.");
  });

  test("a new entry links to the Visual pages list instead", async () => {
    await render(undefined, "/_emdash/admin/content/emvb_pages/new");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/_emdash/admin/plugins/emvb/pages");
  });

  test("entryIdFromLocation reads only emvb_pages entry URLs", () => {
    expect(entryIdFromLocation("/_emdash/admin/content/emvb_pages/a%20b")).toBe("a b");
    expect(entryIdFromLocation("/_emdash/admin/content/posts/123")).toBeUndefined();
  });
});
