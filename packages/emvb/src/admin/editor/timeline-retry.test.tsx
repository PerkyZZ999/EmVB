import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { emptyDesign, type Layout } from "../../core/index.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { TimelineDialog } from "./Timeline.tsx";

afterEach(cleanup);

const layout = {
  schemaVersion: 16,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as unknown as Layout;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const open = (fetcher: (path: string) => Promise<Response>) =>
  mount(
    <TimelineDialog
      open
      onOpenChange={() => undefined}
      fetcher={fetcher}
      collection="emvb_pages"
      entryId="01PAGE"
      current={layout}
      design={emptyDesign()}
      onApply={() => undefined}
    />,
  );

const retry = () => [...document.querySelectorAll("button")].find((b) => b.textContent === "Retry");

test("UX-014: a failed version load offers Retry in the dialog, keeps focus inside, and loads again", async () => {
  let fail = true;
  await open(async (path) => {
    if (!path.includes("/revisions")) return json({ data: { items: [] } });
    return fail
      ? json({ error: { code: "INTERNAL", message: "Server down" } }, 500)
      : json({ data: { items: [] } });
  });
  await settle();
  await settle();
  expect(document.querySelector("[role=alert]")?.textContent ?? "").toContain(
    "Couldn't load versions",
  );
  fail = false;
  const button = retry();
  button?.focus();
  expect(document.activeElement === button).toBe(true);
  await act(async () => button?.click());
  const close = [...document.querySelectorAll("button")].find((b) => b.textContent === "Close");
  expect(document.activeElement === close).toBe(true);
  await settle();
  await settle();
  expect(document.querySelector("[data-emvb-timeline-empty]")?.textContent ?? "").toContain(
    "No saved versions yet",
  );
});

test("UX-014: a host without revisions gets no Retry, because asking again can't help", async () => {
  await open(async () => json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404));
  await settle();
  await settle();
  expect(retry() ? "retry" : "none").toBe("none");
});
