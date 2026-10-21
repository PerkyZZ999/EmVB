import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import {
  decodeSharedPage,
  emptyDesign,
  sharedFromHash,
  type DesignSystem,
  type Layout,
} from "../../core/index.ts";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { ShareLinkDialog, siteOnlyMedia } from "./ShareLink.tsx";

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
afterEach(async () => {
  await cleanup();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

const layout = {
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "img00001",
        type: "image",
        props: { src: "/uploads/a.png", alt: "A", decorative: false },
      },
      {
        id: "img00002",
        type: "image",
        props: { src: "https://cdn.example/b.png", alt: "B", decorative: false },
      },
    ],
  },
} as Layout;

const linkField = () => document.querySelector<HTMLInputElement>("[data-emvb-share-link]");

async function waitForLink(previous?: string) {
  for (
    let i = 0;
    i < 50 && (!linkField()?.value.startsWith("http") || linkField()?.value === previous);
    i += 1
  ) {
    // oxlint-disable-next-line no-await-in-loop
    await act(async () => new Promise((r) => setTimeout(r, 5)));
  }
  return linkField()?.value ?? "";
}

describe("W-321 Share as a playground link", () => {
  test("W-321 builds a link that opens this page, and copies it", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    await mount(
      <ShareLinkDialog
        open
        onOpenChange={() => {}}
        layout={layout}
        design={emptyDesign()}
        title="Home"
        base="https://example.test/playground/"
      />,
    );
    const link = await waitForLink();
    expect(link.startsWith("https://example.test/playground/#p=1.")).toBe(true);
    const read = await decodeSharedPage(sharedFromHash(new URL(link).hash) ?? "");
    expect(read.ok && read.page.title).toBe("Home");
    expect(read.ok && read.page.layout).toEqual(layout);
    expect(document.querySelector("[data-emvb-share-media]")?.textContent).toContain(
      "1 image or video",
    );
    const copy = document.querySelector<HTMLButtonElement>("[data-emvb-share-copy]");
    await act(async () => copy?.click());
    await settle();
    expect(written).toEqual([link]);
    expect(document.body.textContent).toContain("Copied.");
  });

  test("W-321 counts only site-only media", () => {
    expect(siteOnlyMedia(layout)).toBe(1);
  });

  test("site-only backgrounds in device and hover styles count too (W-631)", () => {
    const box = {
      id: "box00001",
      type: "container",
      props: {},
      devices: { mobile: { backgroundImage: "/uploads/m.png" } },
      states: { hover: { backgroundImage: "/uploads/h.png" } },
      children: [],
    };
    const page = { ...layout, root: { ...layout.root, children: [box] } } as unknown as Layout;
    expect(siteOnlyMedia(page)).toBe(2);
  });

  test("W-644: container-query and class backgrounds count, each class once", () => {
    const box = (id: string) => ({
      id,
      type: "container",
      props: {},
      classes: ["hero"],
      query: { min: 600, style: { backgroundImage: "/uploads/q.png" } },
      children: [],
    });
    const page = {
      ...layout,
      root: { ...layout.root, children: [box("box00001"), box("box00002")] },
    } as unknown as Layout;
    const design = {
      ...emptyDesign(),
      classes: [{ id: "hero", name: "hero", style: { backgroundImage: "/uploads/c.png" } }],
    } as DesignSystem;
    expect(siteOnlyMedia(page)).toBe(2);
    expect(siteOnlyMedia(page, design)).toBe(3);
  });
});

test("W-710: copying an old share link cannot mark a rebuilt link as copied", async () => {
  const pending = Promise.withResolvers<void>();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: () => pending.promise },
  });
  const props = {
    open: true,
    onOpenChange: () => undefined,
    layout,
    design: emptyDesign(),
    title: "Before",
  };
  await mount(<ShareLinkDialog {...props} />);
  const before = await waitForLink();
  expect(before.startsWith("http")).toBe(true);
  await act(async () =>
    document.querySelector<HTMLButtonElement>("[data-emvb-share-copy]")?.click(),
  );
  await rerender(<ShareLinkDialog {...props} title="After" />);
  const after = await waitForLink(before);
  expect(after.startsWith("http") && after !== before).toBe(true);
  await act(async () => pending.resolve());
  await settle();
  expect(document.querySelector('[role="status"]') === null).toBe(true);
});

test("W-710: a late failed copy cannot replace the latest successful copy feedback", async () => {
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  let calls = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: () => (++calls === 1 ? first.promise : second.promise) },
  });
  await mount(
    <ShareLinkDialog
      open
      onOpenChange={() => undefined}
      layout={layout}
      design={emptyDesign()}
      title="Home"
    />,
  );
  await waitForLink();
  const copy = document.querySelector<HTMLButtonElement>("[data-emvb-share-copy]");
  if (!copy) throw new Error("Copy link is missing");
  await act(async () => {
    copy.click();
    copy.click();
  });
  expect(calls).toBe(2);
  await act(async () => second.resolve());
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Copied.");
  await act(async () => first.reject(new Error("Clipboard permission refused")));
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Copied.");
});
