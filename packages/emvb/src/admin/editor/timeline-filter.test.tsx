import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { TimelineDialog } from "./Timeline.tsx";

afterEach(cleanup);

const layout: Layout = {
  schemaVersion: 16,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};
const baseProps = {
  onOpenChange: () => undefined,
  collection: "emvb_pages",
  entryId: "01PAGE",
  current: layout,
  design: emptyDesign(),
  onApply: () => undefined,
};
const revision = { id: "r1", createdAt: "2026-10-15T10:00:00Z", data: { layout } };
const agentVersion = { revisionId: "r1", tool: "update_element", summary: "Updated the page" };
async function pick(who: string) {
  const button = document.querySelector<HTMLButtonElement>(`[data-emvb-timeline-who="${who}"]`);
  if (!button) throw new Error(`Version filter is missing: ${who}`);
  await act(async () => button.click());
}

test("W-706: unavailable agent metadata cannot strand the timeline behind a hidden filter", async () => {
  let agentMetadataAvailable = true;
  const fetcher = async (path: string) => {
    if (path.endsWith("/agents/page")) {
      if (!agentMetadataAvailable) throw new Error("Agent metadata unavailable");
      return Response.json({ data: { versions: [agentVersion] } });
    }
    return Response.json({ data: { items: [revision] } });
  };
  await mount(<TimelineDialog {...baseProps} open fetcher={fetcher} />);
  await settle();
  await pick("agents");
  await rerender(<TimelineDialog {...baseProps} open={false} fetcher={fetcher} />);
  agentMetadataAvailable = false;
  await rerender(<TimelineDialog {...baseProps} open fetcher={fetcher} />);
  await settle();
  expect(document.querySelector('[data-emvb-version="r1"]') !== null).toBe(true);
  expect(document.querySelector("[data-emvb-timeline-empty]") === null).toBe(true);
  expect(document.querySelector("[data-emvb-timeline-who]") === null).toBe(true);
});

test("W-706: an empty People filter explains how to return to saved versions", async () => {
  const fetcher = async (path: string) =>
    Response.json({
      data: path.endsWith("/agents/page") ? { versions: [agentVersion] } : { items: [revision] },
    });
  await mount(<TimelineDialog {...baseProps} open fetcher={fetcher} />);
  await settle();
  await pick("people");
  const empty = document.querySelector("[data-emvb-timeline-empty]");
  expect(empty?.textContent).toContain("No saved versions match this filter");
  expect(empty?.textContent).toContain("Choose All");
  expect(empty?.getAttribute("role")).toBe("status");
  await pick("all");
  expect(document.querySelector('[data-emvb-version="r1"]') !== null).toBe(true);
});
