import { describe, expect, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { auditPage } from "./audit.ts";

// The 1.2 widgets: what the accessibility check says about each.
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

describe("Carousel (W-1018)", () => {
  const carousel = (props: Record<string, unknown>) => ({
    id: "caro0001",
    type: "carousel",
    props,
    children: [{ id: "slid0001", type: "carousel-slide", props: {}, children: [] }],
  });

  test("still or slow carousels are fine; slides moving under 5 seconds warn", () => {
    expect(audit(carousel({}))).toEqual([]);
    expect(audit(carousel({ autoplay: true }))).toEqual([]);
    expect(audit(carousel({ autoplay: true, interval: 3 }))).toEqual(["motion:warning:caro0001"]);
  });
});

describe("Counter (W-1038)", () => {
  const counter = (title?: string) => ({
    id: "cntr0001",
    type: "counter",
    props: { value: 1200, ...(title === undefined ? {} : { title }) },
  });

  test("a counter without a title warns that its number says nothing", () => {
    expect(audit(counter("Happy clients"))).toEqual([]);
    expect(audit(counter())).toEqual(["counter-title:warning:cntr0001"]);
    expect(audit(counter("  "))).toEqual(["counter-title:warning:cntr0001"]);
  });
});

describe("Progress bar (W-1039)", () => {
  test("a bar without a title warns that screen readers can't name it", () => {
    const bar = (label?: string) => ({
      id: "prog0001",
      type: "progress",
      props: { value: 50, ...(label === undefined ? {} : { label }) },
    });
    expect(audit(bar("Design"))).toEqual([]);
    expect(audit(bar())).toEqual(["control-name:warning:prog0001"]);
  });
});

describe("Animated headline (W-1046)", () => {
  test("counts as a heading: a second H1 and a skipped level are reported", () => {
    const line = (level: number) => ({
      id: `hdln000${level}`,
      type: "headline",
      props: { highlight: "fast", level },
    });
    expect(audit(line(1))).toEqual(["multiple-h1:warning:hdln0001"]);
    expect(audit(line(4)).some((issue) => issue.startsWith("heading-order"))).toBe(true);
    expect(audit(line(2))).toEqual([]);
  });
});

describe("Hotspots (W-1048)", () => {
  test("a Hotspots picture without alt text is reported like an image", () => {
    const pic = (alt: string) => ({
      id: "spot0001",
      type: "hotspots",
      props: { src: "/a.jpg", alt },
      children: [],
    });
    expect(audit(pic("A car"))).toEqual([]);
    expect(audit(pic(" "))).toEqual(["image-alt:error:spot0001"]);
  });
});

describe("the 1.3 widgets (W-1076)", () => {
  const carousel = (id: string, label?: string) => ({
    id,
    type: "carousel",
    props: label === undefined ? {} : { label },
    children: [{ id: `s${id.slice(1)}`, type: "carousel-slide", props: {}, children: [] }],
  });

  test("two carousels named alike warn on the second; their own names don't", () => {
    expect(audit(carousel("caro0001"), carousel("caro0002"))).toEqual([
      "landmark-name:warning:caro0002",
    ]);
    expect(audit(carousel("caro0001", "Stories"), carousel("caro0002", "stories"))).toEqual([
      "landmark-name:warning:caro0002",
    ]);
    expect(audit(carousel("caro0001", "Stories"), carousel("caro0002", "Team"))).toEqual([]);
  });

  test("a flip box with an empty front title or an empty back warns", () => {
    const flip = (props: Record<string, unknown>) => ({ id: "flip0001", type: "flip-box", props });
    expect(audit(flip({ frontTitle: "Plans", backText: "From $5" }))).toEqual([]);
    expect(audit(flip({ frontTitle: "Plans", buttonText: "See plans", href: "/p" }))).toEqual([]);
    expect(audit(flip({ frontTitle: " ", backText: "x" }))).toEqual([
      "flip-box-face:warning:flip0001",
    ]);
    expect(audit(flip({ frontTitle: "Plans" }))).toEqual(["flip-box-face:warning:flip0001"]);
  });

  test("a flip box whose back button has no usable link warns: the page leaves it out", () => {
    const flip = (props: Record<string, unknown>) => ({
      id: "flip0001",
      type: "flip-box",
      props: { frontTitle: "Plans", backText: "From $5", ...props },
    });
    expect(audit(flip({ buttonText: "See plans", href: "/plans" }))).toEqual([]);
    expect(audit(flip({ href: "/plans" }))).toEqual([]);
    expect(audit(flip({ buttonText: "See plans" }))).toEqual(["link-name:warning:flip0001"]);
    expect(audit(flip({ buttonText: "See plans", href: " " }))).toEqual([
      "link-name:warning:flip0001",
    ]);
    expect(audit(flip({ buttonText: "See plans", href: "javascript:alert(1)" }))).toEqual([
      "link-name:warning:flip0001",
    ]);
    expect(audit(flip({ backText: "", buttonText: "See plans" }))).toEqual([
      "link-name:warning:flip0001",
    ]);
  });

  test("a countdown without a title warns", () => {
    const countdown = (title?: string) => ({
      id: "cdwn0001",
      type: "countdown",
      props: { target: "2027-01-01T00:00Z", ...(title === undefined ? {} : { title }) },
    });
    expect(audit(countdown("Launch sale"))).toEqual([]);
    expect(audit(countdown())).toEqual(["countdown-title:warning:cdwn0001"]);
  });

  test("two markers with one title on a picture warn on the second", () => {
    const marker = (id: string, title: string) => ({
      id,
      type: "hotspot",
      props: { title, x: 10, y: 10 },
    });
    const hotspots = (...children: unknown[]) => ({
      id: "hots0001",
      type: "hotspots",
      props: { src: "/a.jpg", alt: "A car" },
      children,
    });
    expect(audit(hotspots(marker("hspt0001", "Wheel"), marker("hspt0002", "Door")))).toEqual([]);
    expect(audit(hotspots(marker("hspt0001", "Wheel"), marker("hspt0002", "wheel")))).toEqual([
      "hotspot-names:warning:hspt0002",
    ]);
  });
});

describe("mega menu (W-1069)", () => {
  const item = (id: string, text: string, props: object = {}, children: unknown[] = []) => ({
    id,
    type: "menu-item",
    props: { text, ...props },
    children,
  });
  const menu = (...items: unknown[]) => ({
    id: "menu0001",
    type: "menu",
    props: { direction: "row" },
    children: items,
  });

  test("a mega item named for its panel passes", () => {
    expect(audit(menu(item("item0001", "Products", { panelPartId: "p1" })))).toEqual([]);
  });

  test("a vague mega item name warns", () => {
    expect(audit(menu(item("item0002", "More", { panelPartId: "p1" })))).toEqual([
      "mega-panel:warning:item0002",
    ]);
  });

  test("a mega panel inside another item's dropdown warns", () => {
    const nested = item("item0004", "Products", { panelPartId: "p1" });
    expect(audit(menu(item("item0003", "Shop", {}, [nested])))).toEqual([
      "mega-panel:warning:item0004",
    ]);
  });
});

describe("form steps (W-1065)", () => {
  const field = (id: string) => ({
    id,
    type: "text-input",
    props: { field: id, label: "Name" },
  });
  const step = (id: string, title: string | undefined, children: unknown[]) => ({
    id,
    type: "form-step",
    props: title === undefined ? {} : { title },
    children,
  });
  const form = (...children: unknown[]) => ({
    id: "form0001",
    type: "form",
    props: { formId: "f" },
    children,
  });

  test("titled steps with fields, and a Submit outside them, are fine", () => {
    expect(
      audit(
        form(
          step("step0001", "You", [field("inpt0001")]),
          step("step0002", "Trip", [field("inpt0002")]),
          { id: "subm0001", type: "submit", props: {} },
        ),
      ),
    ).toEqual([]);
  });

  test("an untitled step, an empty step and a field outside the steps warn", () => {
    expect(
      audit(
        form(
          field("inpt0009"),
          step("step0001", " ", [field("inpt0001")]),
          step("step0002", "Extras", []),
        ),
      ),
    ).toEqual([
      "form-steps:warning:inpt0009",
      "form-steps:warning:step0001",
      "form-steps:warning:step0002",
    ]);
  });

  test("a form without steps has nothing to say about them", () => {
    expect(audit(form(field("inpt0001")))).toEqual([]);
  });
});
