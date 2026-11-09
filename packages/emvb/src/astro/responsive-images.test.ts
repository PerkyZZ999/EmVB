import { describe, expect, test } from "bun:test";
import type { Layout } from "../core/index.ts";
import {
  sourceWidths,
  withResponsiveSources,
  type ResponsiveGetImage,
} from "./responsive-images.ts";

const image = (props: Record<string, unknown>) => ({ id: "img00001", type: "image", props });
const layout = (props: Record<string, unknown>) =>
  ({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children: [image(props)] },
  }) as unknown as Layout;
const library = { src: "/_emdash/api/media/file/a.jpg", alt: "A", width: 800, height: 600 };
const service: ResponsiveGetImage = async ({ src, widths }) => ({
  src: `/_image?href=${encodeURIComponent(src)}`,
  srcSet: {
    values: widths.map((w) => ({
      url: `/_image?href=${encodeURIComponent(src)}&w=${w}`,
      descriptor: `${w}w`,
    })),
  },
});
const firstProps = (l: Layout) =>
  (l.root as unknown as { children: { props: Record<string, unknown> }[] }).children[0]?.props ??
  {};

describe("withResponsiveSources (W-915)", () => {
  test("a library Image gets sources from the host's image service", async () => {
    const out = await withResponsiveSources(layout(library), service, "http://site.test");
    const sources = firstProps(out).sources as { src: string; width: number }[];
    expect(sources.map((s) => s.width)).toEqual(sourceWidths(800));
    expect(sources[0]?.src).toContain("href=http%3A%2F%2Fsite.test%2F_emdash");
  });

  test("the stored layout is not changed", async () => {
    const stored = layout(library);
    await withResponsiveSources(stored, service, "http://site.test");
    expect(firstProps(stored).sources).toBeUndefined();
  });

  test("an Image with its own sizes, an outside URL or no size is left alone", async () => {
    const own = [{ src: "/x.jpg", width: 400 }];
    const cases = [
      { ...library, sources: own },
      { ...library, src: "https://cdn.test/a.jpg" },
      { ...library, width: undefined },
    ];
    const outs = await Promise.all(
      cases.map((props) => withResponsiveSources(layout(props), service, "http://site.test")),
    );
    expect(outs.map((out) => firstProps(out).sources)).toEqual([own, undefined, undefined]);
  });

  test("a passthrough or failing service leaves the plain img", async () => {
    // Astro passes an unauthorised URL through, with every width pointing at the same file.
    const pass: ResponsiveGetImage = async ({ src, widths }) => ({
      src,
      srcSet: { values: widths.map((w) => ({ url: src, descriptor: `${w}w` })) },
    });
    const fail: ResponsiveGetImage = async () => {
      throw new Error("no service");
    };
    const outs = await Promise.all(
      [pass, fail].map((getImage) =>
        withResponsiveSources(layout(library), getImage, "http://site.test"),
      ),
    );
    expect(outs.map((out) => firstProps(out).sources)).toEqual([undefined, undefined]);
  });

  test("unsafe candidate URLs are dropped and at most six sizes are kept", async () => {
    const odd: ResponsiveGetImage = async () => ({
      src: "/_image?x",
      srcSet: {
        attribute:
          "javascript:alert(1) 640w, /a.jpg 700w, /b,c.jpg 800w, " +
          Array.from({ length: 8 }, (_, i) => `/s${i}.jpg ${900 + i}w`).join(", "),
      },
    });
    const sources = firstProps(
      await withResponsiveSources(layout(library), odd, "http://site.test"),
    ).sources as { src: string }[];
    expect(sources.map((s) => s.src)).toEqual([
      "/a.jpg",
      "/s0.jpg",
      "/s1.jpg",
      "/s2.jpg",
      "/s3.jpg",
      "/s4.jpg",
    ]);
  });

  test("widths go up to twice the shown width, at most six", () => {
    expect(sourceWidths(800)).toEqual([640, 960, 1280, 1600]);
    expect(sourceWidths(3000).length).toBeLessThanOrEqual(6);
  });
});
