import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

// The 1.2 widgets (PLAN_1.2 part D): what the accessibility check says about each.
const audit = (...children: unknown[]) =>
  auditPage(
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
          ...children,
        ],
      },
    } as Layout,
    emptyDesign(),
  ).issues.map((i) => `${i.rule}:${i.severity}:${i.nodeId}`);

describe("Star rating (W-1023)", () => {
  const rating = (label?: string) => ({
    id: "rate0001",
    type: "rating",
    props: { value: 4, ...(label === undefined ? {} : { label }) },
  });

  test("the default text, or one with {value} or a number, says the rating", () => {
    expect(audit(rating())).toEqual([]);
    expect(audit(rating("{value} stars"))).toEqual([]);
    expect(audit(rating("Four out of five: 4/5"))).toEqual([]);
  });

  test("custom text that doesn't say the rating warns", () => {
    expect(audit(rating("Customer rating"))).toEqual(["image-alt:warning:rate0001"]);
  });
});

describe("Alert (W-1025)", () => {
  const alert = (props: Record<string, unknown>) => ({
    id: "alrt0001",
    type: "alert",
    props: { variant: "info", text: "", ...props },
  });

  test("a title or text is enough", () => {
    expect(audit(alert({ text: "Saved." }))).toEqual([]);
    expect(audit(alert({ title: "Saved" }))).toEqual([]);
  });

  test("an empty one warns", () => {
    expect(audit(alert({ title: " ", text: "\u200b" }))).toEqual(["empty-alert:warning:alrt0001"]);
  });
});

describe("Icon box (W-1020)", () => {
  const box = (props: Record<string, unknown>) => ({
    id: "ibox0001",
    type: "icon-box",
    props: { iconId: "star", title: "Fast", text: "Quick.", ...props },
  });

  test("a linked box with a title is fine", () => {
    expect(audit(box({ href: "/features" }))).toEqual([]);
  });

  test("a link without a title warns that the link is left out", () => {
    expect(audit(box({ href: "/features", title: "" }))).toEqual(["link-name:warning:ibox0001"]);
  });
});

describe("Image box (W-1021)", () => {
  const box = (props: Record<string, unknown>) => ({
    id: "imbx0001",
    type: "image-box",
    props: { src: "/a.jpg", alt: "Our team", title: "People", text: "", ...props },
  });

  test("real alt text, a decorative picture or no picture yet is fine", () => {
    expect(audit(box({}))).toEqual([]);
    expect(audit(box({ alt: "", decorative: true }))).toEqual([]);
    expect(audit(box({ src: "", alt: "Image" }))).toEqual([]);
  });

  test("a file-name or placeholder alt is an error; a link without a title warns", () => {
    expect(audit(box({ alt: "IMG_2041.jpg" }))).toEqual(["image-alt:error:imbx0001"]);
    expect(audit(box({ alt: "Image" }))).toEqual(["image-alt:error:imbx0001"]);
    expect(audit(box({ href: "/team", title: "" }))).toEqual(["link-name:warning:imbx0001"]);
  });
});

describe("Testimonial (W-1022)", () => {
  const quote = (text: string) => ({
    id: "tsti0001",
    type: "testimonial",
    props: { quote: text, name: "Ada" },
  });

  test("a quote is fine; an empty one warns", () => {
    expect(audit(quote("It works."))).toEqual([]);
    expect(audit(quote("  "))).toEqual(["empty-alert:warning:tsti0001"]);
  });
});

describe("Social icons (W-1024)", () => {
  const icons = (props: Record<string, unknown>, ...links: [string, string][]) => ({
    id: "soci0001",
    type: "social-icons",
    props,
    children: links.map(([network, href], i) => ({
      id: `sl00000${i}`,
      type: "social-link",
      props: { network, href },
    })),
  });

  test("links with addresses and readable colours are fine", () => {
    expect(audit(icons({ brandColors: true }, ["facebook", "https://facebook.com/x"]))).toEqual([]);
  });

  test("a link with no usable address warns", () => {
    expect(audit(icons({}, ["x", ""], ["github", "javascript:alert(1)"]))).toEqual([
      "link-name:warning:sl000000",
      "link-name:warning:sl000001",
    ]);
  });

  test("brand colours under 3:1 on white are named once", () => {
    const issues = auditPage(
      {
        schemaVersion: 18,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            { id: "head0001", type: "heading", props: { text: "T", level: 1 } },
            icons(
              { brandColors: true },
              ["whatsapp", "https://wa.me/1"],
              ["whatsapp", "https://wa.me/2"],
              ["spotify", "https://open.spotify.com/x"],
            ),
          ],
        },
      } as Layout,
      emptyDesign(),
    ).issues;
    expect(issues.map((i) => `${i.rule}:${i.nodeId}`)).toEqual(["contrast:soci0001"]);
    expect(issues[0]?.message).toContain("WhatsApp, Spotify");
    expect(audit(icons({}, ["whatsapp", "https://wa.me/1"]))).toEqual([]);
  });
});

describe("Gallery (W-1019)", () => {
  const gallery = (alt: string) => ({
    id: "gall0001",
    type: "gallery",
    props: {},
    children: [{ id: "pict0001", type: "gallery-image", props: { src: "/a.jpg", alt } }],
  });

  test("pictures need real alt text, as Images do", () => {
    expect(audit(gallery("The harbour at dawn"))).toEqual([]);
    expect(audit(gallery("DSC_0042.jpg"))).toEqual(["image-alt:error:pict0001"]);
  });
});
