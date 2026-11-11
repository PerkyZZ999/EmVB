import { afterEach, expect, test } from "bun:test";
import { LAYOUT_SCHEMA_VERSION, type Layout } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { partDraftLabel, usePartTemplates } from "./section-templates.ts";

afterEach(cleanup);

const sectionLayout: Layout = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0002", type: "container", props: {}, children: [] },
};
const page: Layout = {
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "ref00001", type: "part-ref", props: { partId: "sec" }, children: [] }],
  },
};

const fetcher: Fetcher = async (path) =>
  path.includes("?")
    ? Response.json({
        data: {
          items: [
            {
              id: "sec",
              status: "published",
              draftRevisionId: "r1",
              data: { part_type: "section" },
            },
            { id: "other", status: "draft", data: { part_type: "section" } },
          ],
        },
      })
    : Response.json({
        data: { item: { id: "sec", data: { part_type: "section", layout: sectionLayout } } },
      });

let seen: ReturnType<typeof usePartTemplates> | undefined;
function Probe() {
  seen = usePartTemplates(page, fetcher);
  return null;
}

test("W-970: the canvas knows which synced sections it draws from unpublished changes", async () => {
  await mount(<Probe />);
  const loaded = () => seen?.partStatus !== undefined;
  for (let i = 0; i < 10 && !loaded(); i += 1)
    // oxlint-disable-next-line no-await-in-loop -- waits for the parts to load
    await settle();
  expect(seen?.partStatus).toEqual({ sec: "changed" });
  expect(partDraftLabel("changed")).toBe("unpublished changes");
  expect(partDraftLabel("draft")).toBe("not published");
});
