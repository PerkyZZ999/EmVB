import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { contentSnippet } from "../search.ts";
import { PageList } from "./PageList.tsx";

afterEach(cleanup);

const layout = (text: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "text0001", type: "text", props: { text } }],
  },
});

/** A fake site with three pages; it records what the bulk actions send. */
function site(failId?: string) {
  const calls: string[] = [];
  const trashed = new Set<string>();
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      calls.push(`${method} ${path}`);
      if (failId && path.includes(`/${failId}`))
        return Response.json(
          { error: { code: "FORBIDDEN", message: "Not allowed" } },
          { status: 403 },
        );
      const id = path.split("/")[5] ?? "";
      if (method === "DELETE") trashed.add(id);
      if (path.endsWith("/restore")) trashed.delete(id);
      return Response.json({ data: { _rev: "r2", item: { slug: "x" } } });
    }
    const all = [
      {
        id: "01A",
        slug: "about",
        status: "draft",
        data: { title: "About", layout: layout("We grow tomatoes") },
      },
      {
        id: "01B",
        slug: "contact",
        status: "draft",
        data: { title: "Contact", layout: layout("Call us") },
      },
      {
        id: "01C",
        slug: "shop",
        status: "published",
        data: { title: "Shop", layout: layout("Seeds") },
      },
    ];
    return Response.json({ data: { items: all.filter((p) => !trashed.has(p.id)) } });
  };
  return { fetcher, calls };
}

const rows = () =>
  [...document.querySelectorAll("[data-emvb-row]")].map((r) => r.getAttribute("data-emvb-row"));
const click = async (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  await act(async () => el.click());
  await settle();
};
const statusText = () => document.querySelector("[data-emvb-bulk-status]")?.textContent ?? "";
const waitForStatus = async (text: string) => {
  for (let i = 0; i < 30; i += 1) {
    if (statusText().includes(text)) break;
    // oxlint-disable-next-line no-await-in-loop -- waits for the requests
    await settle();
  }
  return statusText();
};

test("W-978: the Pages list finds a page by the words on it, and says so", async () => {
  const { fetcher } = site();
  await mount(<PageList fetcher={fetcher} />);
  await settle();
  const input = document.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error("no search");
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(input, "tomatoes");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
  expect(rows()).toEqual(["01A"]);
  expect(document.querySelector("[data-emvb-found-in]")?.textContent).toBe(
    "Found in content: We grow tomatoes",
  );
});

test("W-978: content snippets only when the title doesn't match", () => {
  expect(contentSnippet("about", "We grow tomatoes", "About")).toBeUndefined();
  expect(contentSnippet("grow", "We grow tomatoes", "About")).toBe("We grow tomatoes");
  expect(contentSnippet("", "We grow tomatoes", "About")).toBeUndefined();
});

test("W-978: publish the ticked pages; one that fails is named and the rest go on", async () => {
  const { fetcher, calls } = site("01B");
  await mount(<PageList fetcher={fetcher} />);
  await settle();
  await click('[data-emvb-select-row="01A"]');
  await click('[data-emvb-select-row="01B"]');
  await click('[data-emvb-select-row="01C"]');
  expect(document.querySelector(".emvb-bulk-count")?.textContent).toBe("3 pages selected");
  await click('[data-emvb-bulk="publish"]');
  const status = await waitForStatus("Published");
  expect(calls).toEqual([
    "POST /_emdash/api/content/emvb_pages/01A/publish",
    "POST /_emdash/api/content/emvb_pages/01B/publish",
    "POST /_emdash/api/content/emvb_pages/01C/publish",
  ]);
  expect(status).toContain("Published 2 pages.");
  expect(status).toContain("Not published: Contact (Not allowed).");
});

test("W-978: delete moves the ticked pages to the trash after a confirm, and Restore brings them back", async () => {
  const { fetcher, calls } = site();
  await mount(<PageList fetcher={fetcher} />);
  await settle();
  await click("[data-emvb-select-all]");
  expect(document.querySelector(".emvb-bulk-count")?.textContent).toBe("3 pages selected");
  await click('[data-emvb-bulk="delete"]');
  expect(document.querySelector('[data-emvb-dialog="bulk-delete"]')?.textContent).toContain(
    "About, Contact, Shop go to EmDash's trash",
  );
  // Nothing is deleted before the confirm.
  expect(calls).toEqual([]);
  await click("[data-emvb-bulk-confirm]");
  expect(await waitForStatus("Moved to the trash")).toContain("Moved to the trash: 3 pages.");
  expect(calls.filter((c) => c.startsWith("DELETE"))).toHaveLength(3);
  for (let i = 0; i < 10 && rows().length > 0; i += 1)
    // oxlint-disable-next-line no-await-in-loop -- the list reloads
    await settle();
  expect(rows()).toEqual([]);
  await click('[data-emvb-bulk="restore"]');
  expect(await waitForStatus("Restored")).toContain("Restored 3 pages.");
  expect(calls.filter((c) => c.endsWith("/restore"))).toHaveLength(3);
});
