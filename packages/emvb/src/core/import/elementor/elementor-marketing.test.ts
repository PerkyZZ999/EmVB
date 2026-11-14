import { describe, expect, test } from "bun:test";
import type { Layout, LayoutNode } from "../../schema/layout.ts";
import { validateLayout } from "../../validate.ts";
import { importElementor } from "./index.ts";

// W-1049: Elementor import part 2: the marketing widgets become EmVB's own elements.

type Node = LayoutNode & { children?: Node[]; style?: Record<string, unknown> };
const all = (node: Node): Node[] => [node, ...(node.children ?? []).flatMap(all)];

function imported(widgetType: string, settings: Record<string, unknown>) {
  const result = importElementor(
    JSON.stringify([{ id: "w", elType: "widget", widgetType, settings }]),
  );
  if (!result.ok) throw new Error(result.error);
  // The import is a layout EmVB saves as it is.
  expect(validateLayout(result.layout).ok).toBe(true);
  const nodes = all(result.layout.root as Node);
  return {
    of: (type: string) => nodes.filter((n) => n.type === type),
    props: (type: string) =>
      (nodes.find((n) => n.type === type)?.props ?? {}) as Record<string, unknown>,
    notes: result.notes.map((n) => n.message).join("\n"),
    layout: result.layout as Layout,
  };
}

describe("Elementor import part 2 (W-1049)", () => {
  test("a Counter keeps its start, separator and decimals, and counts up in 5 s at most", () => {
    const r = imported("counter", {
      starting_number: 10,
      ending_number: 99.5,
      thousand_separator: "yes",
      thousand_separator_char: ".",
      duration: 9000,
      prefix: "$",
    });
    expect(r.props("counter")).toEqual({
      value: 99.5,
      start: 10,
      decimals: 1,
      separator: ".",
      prefix: "$",
      countUp: true,
      duration: 5000,
    });
    expect(r.notes).toContain("Counters count up in 5 seconds at most.");
  });

  test("a Countdown with a due date ticks, hides or links when done; evergreen ones are left out", () => {
    const due = imported("countdown", {
      countdown_type: "due_date",
      due_date: "2027-03-01 18:30",
      expire_actions: ["redirect"],
      expire_redirect_url: { url: "/offers" },
      message_after_expire: "See the new offers",
      show_seconds: "",
    });
    expect(due.props("countdown")).toEqual({
      target: "2027-03-01T18:30Z",
      ticking: true,
      hideSeconds: true,
      expired: "link",
      expiredHref: "/offers",
      expiredText: "See the new offers",
    });
    expect(due.notes).toContain("read as UTC");
    expect(
      imported("countdown", { due_date: "2027-03-01 18:30", expire_actions: ["hide"] }).props(
        "countdown",
      ),
    ).toMatchObject({ expired: "hide" });
    const evergreen = importElementor(
      JSON.stringify([
        { id: "a", elType: "widget", widgetType: "heading", settings: { title: "Hi" } },
        {
          id: "w",
          elType: "widget",
          widgetType: "countdown",
          settings: { countdown_type: "evergreen" },
        },
      ]),
    );
    if (!evergreen.ok) throw new Error(evergreen.error);
    expect(evergreen.notes.map((n) => n.message).join("\n")).toContain("Evergreen countdowns");
  });

  test("a Price Table on sale keeps its regular price and its ribbon", () => {
    const r = imported("price-table", {
      heading: "Team",
      price: "19",
      sale: "yes",
      original_price: "29",
      show_ribbon: "yes",
      ribbon_title: "Popular",
      currency_symbol: "pound",
    });
    expect(r.props("price-table")).toMatchObject({
      title: "Team",
      price: "19",
      regularPrice: "29",
      currency: "£",
      featured: true,
      ribbon: "Popular",
    });
  });

  test("a Price List becomes rows with their pictures and links", () => {
    const r = imported("price-list", {
      price_list: [
        {
          title: "Espresso",
          price: "$3",
          item_description: "Short and strong",
          image: { url: "https://old.example/esp.jpg" },
          link: { url: "/coffee" },
        },
        { title: "", price: "$1" },
      ],
    });
    expect(r.of("price-list-item")).toHaveLength(1);
    expect(r.props("price-list-item")).toEqual({
      title: "Espresso",
      price: "$3",
      description: "Short and strong",
      src: "https://old.example/esp.jpg",
      href: "/coffee",
    });
  });

  test("a cover Call to Action puts its picture behind the words", () => {
    const r = imported("call-to-action", {
      skin: "cover",
      title: "Join us",
      bg_image: { url: "https://old.example/bg.jpg" },
      ribbon_title: "New",
    });
    expect(r.props("cta")).toMatchObject({ title: "Join us", layout: "behind", ribbon: "New" });
  });

  test("a Flip Box keeps its direction; an Animated Headline its highlight shape", () => {
    expect(
      imported("flip-box", { title_text_a: "A", title_text_b: "B", flip_direction: "up" }).props(
        "flip-box",
      ),
    ).toMatchObject({ frontTitle: "A", backTitle: "B", direction: "up" });
    expect(
      imported("animated-headline", {
        headline_style: "highlight",
        before_text: "We",
        highlighted_text: "love",
        after_text: "pages",
        marker: "strikethrough",
        tag: "h1",
      }).props("headline"),
    ).toEqual({ level: 1, before: "We", highlight: "love", after: "pages", mark: "strike" });
  });

  test("Share Buttons keep the services EmVB has and say which were left out", () => {
    const r = imported("share-buttons", {
      share_buttons: [{ button: "facebook" }, { button: "twitter" }, { button: "vk" }],
      shape: "circle",
    });
    expect(r.of("share-link").map((n) => (n.props as { network: string }).network)).toEqual([
      "facebook",
      "x",
    ]);
    expect(r.props("share-buttons")).toMatchObject({ shape: "circle", brandColors: true });
    expect(r.notes).toContain("services EmVB has no link for");
  });

  test("a Hotspot keeps its picture and each marker's place on every device", () => {
    const r = imported("hotspot", {
      image: { url: "https://old.example/car.jpg", alt: "A car" },
      hotspot: [
        {
          hotspot_label: "Wheel",
          hotspot_tooltip_content: "<p>Alloy</p>",
          hotspot_offset_x: { unit: "%", size: 20 },
          hotspot_offset_y: { unit: "%", size: 70 },
          hotspot_offset_x_mobile: { unit: "%", size: 30 },
        },
      ],
    });
    expect(r.props("hotspots")).toMatchObject({ src: "https://old.example/car.jpg", alt: "A car" });
    expect(r.props("hotspot")).toEqual({
      title: "Wheel",
      text: "Alloy",
      x: 20,
      y: 70,
      xMobile: 30,
    });
  });

  test("Slides and the Testimonial Carousel become a Carousel of slides, not a stack", () => {
    const slides = imported("slides", {
      slides: [
        { heading: "One", description: "First" },
        { heading: "Two", description: "Second" },
      ],
      navigation: "dots",
      autoplay: "yes",
      autoplay_speed: 7000,
    });
    expect(slides.props("carousel")).toEqual({
      perView: 1,
      dots: true,
      autoplay: true,
      interval: 7,
      loop: true,
    });
    expect(slides.of("carousel-slide")).toHaveLength(2);
    const quotes = imported("testimonial-carousel", {
      slides: [
        { content: "Great", name: "Ada" },
        { content: "Fast", name: "Linus" },
      ],
      slides_per_view: 2,
    });
    expect(quotes.props("carousel")).toMatchObject({ perView: 2 });
    expect(quotes.of("carousel-slide").map((s) => s.children?.[0]?.type)).toEqual([
      "testimonial",
      "testimonial",
    ]);
  });
});
