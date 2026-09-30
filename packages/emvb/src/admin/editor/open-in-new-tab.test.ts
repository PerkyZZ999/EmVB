import { afterEach, expect, spyOn, test } from "bun:test";
import { openInNewTab } from "./useEditorCommands.ts";

const fakeTab = () => ({
  opener: {} as unknown,
  location: { href: "" },
  close: () => {},
  closed: false,
});

let open: ReturnType<typeof spyOn> | undefined;
afterEach(() => open?.mockRestore());

function stubOpen(tab: ReturnType<typeof fakeTab> | null) {
  if (tab) tab.close = () => (tab.closed = true);
  open = spyOn(window, "open").mockImplementation(() => tab as unknown as Window);
}

test("the tab opens before the URL is known, then goes there with no opener", async () => {
  const tab = fakeTab();
  stubOpen(tab);
  const errors: unknown[] = [];
  await openInNewTab(
    async () => "/preview?t=1",
    (e) => errors.push(e),
  );
  expect(open?.mock.calls[0]).toEqual(["", "_blank"]);
  expect(tab).toMatchObject({ opener: null, location: { href: "/preview?t=1" }, closed: false });
  expect(errors).toEqual([]);
});

test("a null URL (the save already reported) closes the tab quietly", async () => {
  const tab = fakeTab();
  stubOpen(tab);
  const errors: unknown[] = [];
  await openInNewTab(
    async () => null,
    (e) => errors.push(e),
  );
  expect(tab.closed).toBe(true);
  expect(errors).toEqual([]);
});

test("a failed preview-URL request closes the tab and reports the error", async () => {
  const tab = fakeTab();
  stubOpen(tab);
  const errors: unknown[] = [];
  const failure = new Error("Preview is not available");
  await openInNewTab(
    async () => {
      throw failure;
    },
    (e) => errors.push(e),
  );
  expect(tab.closed).toBe(true);
  expect(errors).toEqual([failure]);
});

test("a blocked pop-up still reports a failed request", async () => {
  stubOpen(null);
  const errors: unknown[] = [];
  await openInNewTab(
    async () => {
      throw new Error("down");
    },
    (e) => errors.push(e),
  );
  expect(errors).toHaveLength(1);
});
