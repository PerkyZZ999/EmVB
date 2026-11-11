// oxlint-disable no-underscore-dangle -- Portable Text names its fields _type and _key.
import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { planRichText } from "./convert-body.ts";
import { ConvertToRichText } from "./ConvertToRichText.tsx";

afterEach(cleanup);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(status < 400 ? { data } : { error: data }), {
    status,
    headers: { "content-type": "application/json" },
  });

const layout: Layout = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "About", level: 1 } },
      { id: "sec00001", type: "part-ref", props: { partId: "sec" }, children: [] },
      { id: "form0001", type: "form", props: { formId: "f" }, children: [] },
    ],
  },
};

function fake(current: unknown, putStatus = 200) {
  const writes: unknown[] = [];
  const fetcher: Fetcher = async (path, init) => {
    if (path.startsWith("/_emdash/api/schema/"))
      return json({ item: { slug: "pages", fields: [{ slug: "content", type: "portableText" }] } });
    if (path.startsWith("/_emdash/api/content/emvb_theme_parts"))
      return json({
        items: [
          {
            id: "sec",
            status: "published",
            data: {
              part_type: "section",
              layout: {
                schemaVersion: LAYOUT_SCHEMA_VERSION,
                root: {
                  id: "root0002",
                  type: "container",
                  props: {},
                  children: [{ id: "text0001", type: "text", props: { text: "Shared words" } }],
                },
              },
            },
          },
        ],
      });
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));
      return putStatus < 400
        ? json({ _rev: "2" })
        : json({ code: "CONFLICT", message: "Changed" }, putStatus);
    }
    return json({ item: { data: { content: current } } });
  };
  return { fetcher, writes };
}

const entry = { collection: "pages", id: "01ABC" };

test("the plan resolves synced sections, counts what's left out and sees existing content (W-963)", async () => {
  const plan = await planRichText(fake([{ _type: "block" }]).fetcher, entry, layout);
  if (!plan.ok) throw new Error(plan.message);
  expect(plan.field).toBe("content");
  expect(plan.body.map((b) => (b._type === "block" ? b.children[0]?.text : ""))).toEqual([
    "About",
    "Shared words",
  ]);
  expect(plan.skipped).toEqual({ form: 1 });
  expect(plan.replaces).toBe(true);
  expect((await planRichText(fake([]).fetcher, entry, layout)).ok && true).toBe(true);
  const empty = await planRichText(fake(null).fetcher, entry, layout);
  expect(empty.ok && empty.replaces).toBe(false);
});

const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`${name} is missing`);
  return found;
};

test("nothing is written until the confirm; then only the rich-text field, and the entry reloads", async () => {
  const { fetcher, writes } = fake([{ _type: "block" }]);
  let reloads = 0;
  await mount(
    <ConvertToRichText
      fetcher={fetcher}
      entry={entry}
      layout={layout}
      reload={() => (reloads += 1)}
    />,
  );
  await act(async () => button("Convert to rich text").click());
  await settle();
  const dialog = document.querySelector('[data-emvb-dialog="convert-rich-text"]');
  expect(dialog?.textContent).toContain("Copy this layout into content?");
  expect(dialog?.textContent).toContain("replacing what it holds now");
  expect(dialog?.textContent).toContain("Left out: form.");
  expect(writes).toEqual([]);

  await act(async () => button("Replace content").click());
  await settle();
  expect(writes).toHaveLength(1);
  const sent = writes[0] as { data: Record<string, unknown> };
  expect(Object.keys(sent.data)).toEqual(["content"]);
  expect(reloads).toBe(1);
});

test("Cancel writes nothing; a refused write says the field wasn't changed", async () => {
  const { fetcher, writes } = fake(null, 409);
  let reloads = 0;
  await mount(
    <ConvertToRichText
      fetcher={fetcher}
      entry={entry}
      layout={layout}
      reload={() => (reloads += 1)}
    />,
  );
  await act(async () => button("Convert to rich text").click());
  await settle();
  await act(async () => button("Cancel").click());
  await settle();
  expect(writes).toEqual([]);
  expect(document.querySelector('[data-emvb-dialog="convert-rich-text"]')).toBeNull();

  await act(async () => button("Convert to rich text").click());
  await settle();
  await act(async () => button("Copy into content").click());
  await settle();
  expect(reloads).toBe(0);
  expect(document.querySelector('[data-emvb-convert="error"]')?.textContent).toContain(
    "The content field wasn't changed",
  );
});
