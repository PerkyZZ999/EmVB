import { afterEach, describe, expect, test } from "bun:test";
import { emptyDesign, type Layout, type LayoutNode } from "../../../../core/index.ts";
import type { Fetcher } from "../../../api.ts";
import { ElementPanel } from "../ElementPanel.tsx";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { imageAltNote } from "./image-alt.ts";

const stubFetcher: Fetcher = async () => new Response("{}", { status: 200 });
afterEach(async () => {
  await cleanup();
  sessionStorage.clear();
});

const img = (props: Record<string, unknown>): LayoutNode =>
  ({ id: "img00001", type: "image", props: { src: "/a.jpg", ...props } }) as unknown as LayoutNode;

describe("Image alt text notes (W-265)", () => {
  test("no alt, the Image placeholder, and camera or file names get a note", () => {
    expect(imageAltNote(img({ alt: "" }))).toContain("no alt text");
    expect(imageAltNote(img({ alt: "  " }))).toContain("no alt text");
    expect(imageAltNote(img({ alt: "Image" }))).toContain("doesn't say what the image shows");
    expect(imageAltNote(img({ alt: "IMG_2034" }))).toContain("IMG_2034");
    expect(imageAltNote(img({ alt: "DSC 0041" }))).toBeDefined();
    expect(imageAltNote(img({ alt: "team-photo.jpg" }))).toBeDefined();
  });
  test("a real description, a decorative image or one without a picture has none", () => {
    expect(imageAltNote(img({ alt: "Our team at the 2026 offsite" }))).toBeUndefined();
    expect(imageAltNote(img({ alt: "Photo of the bakery front" }))).toBeUndefined();
    expect(imageAltNote(img({ alt: "", decorative: true }))).toBeUndefined();
    expect(imageAltNote(img({ alt: "Image", src: "" }))).toBeUndefined();
  });
  test("the Image panel shows the note", async () => {
    const node = img({ alt: "Image" });
    const layout = {
      schemaVersion: 13,
      root: { id: "root0001", type: "container", props: {}, children: [node] },
    } as Layout;
    await mount(
      <ElementPanel
        node={node}
        layout={layout}
        design={emptyDesign()}
        rejection={null}
        fetcher={stubFetcher}
        onChange={() => undefined}
        onDesignChange={async () => undefined}
        onSelect={() => undefined}
      />,
    );
    expect(document.querySelector("[data-emvb-alt-note]")?.textContent).toContain("“Image”");
  });
});
