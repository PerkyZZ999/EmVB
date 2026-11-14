import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout } from "../index.ts";
import { nestingIssues } from "../nesting.ts";
import { formatCounter } from "./counter-format.ts";
import { shareHref } from "./marketing.ts";

const page = (...children: unknown[]) =>
  validateLayout({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children },
  });

function rendered(...children: unknown[]) {
  const result = page(...children);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return renderPage(result.layout, emptyDesign());
}

const counter = (props: Record<string, unknown>) => ({
  id: "cntr0001",
  type: "counter",
  props: { value: 1200, ...props },
});

describe("formatCounter (W-1038)", () => {
  test("groups thousands, rounds to its decimals and keeps the sign", () => {
    expect(formatCounter(1234567)).toBe("1234567");
    expect(formatCounter(1234567, 0, ",")).toBe("1,234,567");
    expect(formatCounter(1234.5, 2, " ")).toBe("1 234.50");
    expect(formatCounter(1234.5, 1, ".")).toBe("1.234,5");
    expect(formatCounter(-9876.54, 1, "'")).toBe("-9'876.5");
    expect(formatCounter(-0.04, 1)).toBe("0.0");
    expect(formatCounter(999.96, 1, ",")).toBe("1,000.0");
  });
});

describe("Counter (W-1038)", () => {
  test("shows the final number with prefix, suffix and title as text, with no script", () => {
    const { html, css, runtimes } = rendered(
      counter({ prefix: "$", suffix: "+", title: "Raised", separator: "," }),
    );
    expect(html).toContain(
      '<p class="emvb-counter-number"><span class="emvb-counter-prefix">$</span><span class="emvb-counter-value">1,200</span><span class="emvb-counter-suffix">+</span></p><p class="emvb-counter-title">Raised</p>',
    );
    expect(html.includes("data-emvb-counter")).toBe(false);
    expect(css).toContain("font-variant-numeric:tabular-nums");
    expect(runtimes).toEqual([]);
  });

  test("countUp asks for the counter runtime and carries what it needs", () => {
    const { html, runtimes } = rendered(
      counter({ value: 98.5, decimals: 1, start: 10, countUp: true, duration: 1500 }),
    );
    expect(html).toContain(
      '<span class="emvb-counter-value" data-emvb-counter="" data-from="10" data-to="98.5" data-decimals="1" data-duration="1500">98.5</span>',
    );
    expect(runtimes).toEqual(["counter"]);
    expect(rendered(counter({ countUp: true }))).toMatchObject({ runtimes: ["counter"] });
    expect(rendered(counter({ countUp: true })).html).toContain('data-from="0" data-to="1200"');
  });

  test("text is escaped; an empty title is left out", () => {
    const { html } = rendered(counter({ prefix: "<b>", title: "  " }));
    expect(html).toContain('<span class="emvb-counter-prefix">&lt;b&gt;</span>');
    expect(html.includes("emvb-counter-title")).toBe(false);
  });

  test("refuses a count-up longer than 5 seconds, unknown separators and too many decimals", () => {
    expect(page(counter({ duration: 5001 })).ok).toBe(false);
    expect(page(counter({ duration: 5000 })).ok).toBe(true);
    expect(page(counter({ separator: "_" })).ok).toBe(false);
    expect(page(counter({ decimals: 4 })).ok).toBe(false);
    expect(page(counter({ value: 2e12 })).ok).toBe(false);
  });
});

const bar = (props: Record<string, unknown>) => ({
  id: "prog0001",
  type: "progress",
  props: { value: 75, label: "Design", ...props },
});

describe("Progress bar (W-1039)", () => {
  test("a named meter with its value as text and a fill as wide as the value, with no script", () => {
    const { html, runtimes } = rendered(bar({ showValue: true }));
    expect(html).toContain(
      '<div class="emvb-progress-head"><span class="emvb-progress-label">Design</span><span class="emvb-progress-value" aria-hidden="true">75%</span></div>',
    );
    expect(html).toContain(
      'role="meter" aria-label="Design" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75" aria-valuetext="75%"',
    );
    expect(html).toContain('<rect class="emvb-progress-fill" width="75%" height="100%" rx="4"');
    expect(html.includes("style=")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("a task's progress is a progressbar; the value is a share of max, never past full", () => {
    const html = rendered(bar({ kind: "progressbar", value: 3, max: 4, thickness: 12 })).html;
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemax="4" aria-valuenow="3" aria-valuetext="75%"');
    expect(html).toContain('height="12"');
    const over = rendered(bar({ value: 9, max: 4 })).html;
    expect(over).toContain('aria-valuenow="4" aria-valuetext="100%"');
    expect(over).toContain('class="emvb-progress-fill" width="100%"');
    expect(rendered(bar({ value: 0 })).html.includes("emvb-progress-fill")).toBe(false);
  });

  test("grow adds a CSS-only fill animation that reduced motion leaves out", () => {
    const { html, css } = rendered(bar({ grow: true }));
    expect(html).toContain('class="emvb-progress emvb-progress-grow"');
    expect(css).toContain(
      "@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){.emvb-progress-grow .emvb-progress-fill{",
    );
    expect(rendered(bar({})).html.includes("emvb-progress-grow")).toBe(false);
  });

  test("refuses a max of 0 and a negative value", () => {
    expect(page(bar({ max: 0 })).ok).toBe(false);
    expect(page(bar({ value: -1 })).ok).toBe(false);
  });
});

const countdownNode = (props: Record<string, unknown>) => ({
  id: "cdwn0001",
  type: "countdown",
  props: { target: "2026-12-01T09:00-05:00", ...props },
});

describe("Countdown (W-1040)", () => {
  test("without ticking it is a sentence with the target as a <time>, and no script", () => {
    const { html, runtimes } = rendered(countdownNode({ title: "Sale" }));
    expect(html).toContain(
      '<p class="emvb-countdown-title">Sale</p><p class="emvb-countdown-target">Ends <time datetime="2026-12-01T09:00-05:00">1 Dec 2026, 09:00 UTC−5</time></p>',
    );
    expect(html.includes("emvb-countdown-clock")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("names the zone it was written in", () => {
    const label = (target: string) =>
      rendered(countdownNode({ target })).html.match(/<time[^>]*>([^<]*)</)?.[1];
    expect(label("2027-03-09T23:30Z")).toBe("9 Mar 2027, 23:30 UTC");
    expect(label("2027-03-09T23:30+05:30")).toBe("9 Mar 2027, 23:30 UTC+5:30");
    expect(label("2027-03-09T23:30:15+00:00")).toBe("9 Mar 2027, 23:30 UTC");
  });

  test("ticking adds a clock hidden from screen readers, a Pause button and the ended text", () => {
    const { html, css, runtimes } = rendered(
      countdownNode({ ticking: true, hideSeconds: true, expiredText: "Too late" }),
    );
    expect(runtimes).toEqual(["countdown"]);
    expect(html).toContain(
      'data-emvb-countdown="" data-target="2026-12-01T09:00-05:00" data-expired="text"',
    );
    expect(html).toContain('<div class="emvb-countdown-units" aria-hidden="true">');
    expect(html.match(/data-unit=/g)).toHaveLength(3);
    expect(html).toContain(
      '<button type="button" class="emvb-countdown-pause" aria-pressed="false">Pause</button>',
    );
    expect(html).toContain('<p class="emvb-countdown-expired">Too late</p>');
    // Until the script runs, the clock and the ended text stay out of sight.
    expect(css).toContain(
      ".emvb-countdown:not([data-emvb-ready]) .emvb-countdown-clock,.emvb-countdown-expired:not([data-emvb-shown])",
    );
    // When time is up the script hides the clock with the hidden attribute, which display:flex would beat.
    expect(css).toContain(".emvb-countdown[hidden],.emvb-countdown-clock[hidden]{display:none}");
  });

  test("the ended text can be a link, or left out when the countdown hides", () => {
    const link = rendered(
      countdownNode({
        ticking: true,
        expired: "link",
        expiredHref: "/offers",
        expiredText: "See offers",
      }),
    ).html;
    expect(link).toContain(
      '<p class="emvb-countdown-expired"><a href="/offers">See offers</a></p>',
    );
    const unsafe = rendered(
      countdownNode({ ticking: true, expired: "link", expiredHref: "javascript:alert(1)" }),
    ).html;
    expect(unsafe.includes("javascript:")).toBe(false);
    const hide = rendered(countdownNode({ ticking: true, expired: "hide" })).html;
    expect(hide.includes("emvb-countdown-expired")).toBe(false);
  });

  test("the target needs a UTC offset and a real date", () => {
    expect(page(countdownNode({ target: "2026-12-01T09:00" })).ok).toBe(false);
    expect(page(countdownNode({ target: "2026-12-01 09:00Z" })).ok).toBe(false);
    expect(page(countdownNode({ target: "2026-13-01T09:00Z" })).ok).toBe(false);
    expect(page(countdownNode({ target: "2026-12-01T09:00Z" })).ok).toBe(true);
  });
});

const mapNode = (props: Record<string, unknown>) => ({
  id: "mapp0001",
  type: "map",
  props: { address: "1 Main St\nSpringfield", ...props },
});

describe("Map (W-1041)", () => {
  test("without embed it is the address and a link to the place, with no script", () => {
    const { html, runtimes } = rendered(mapNode({}));
    expect(html).toContain('<p class="emvb-map-address">1 Main St\nSpringfield</p>');
    expect(html).toContain(
      '<a class="emvb-map-link" href="https://www.openstreetmap.org/search?query=1%20Main%20St%0ASpringfield" rel="noopener">Open in OpenStreetMap</a>',
    );
    expect(html.includes("<iframe")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("coordinates and Google Maps change the link", () => {
    const osm = rendered(mapNode({ lat: 48.8584, lng: 2.2945, zoom: 16 })).html;
    expect(osm).toContain(
      'href="https://www.openstreetmap.org/?mlat=48.8584&amp;mlon=2.2945#map=16/48.8584/2.2945"',
    );
    const google = rendered(mapNode({ provider: "google", linkText: "Directions" })).html;
    expect(google).toContain(
      'href="https://www.google.com/maps/search/?api=1&amp;query=1%20Main%20St%0ASpringfield" rel="noopener">Directions</a>',
    );
  });

  test("embed adds a button that loads the map on request, and asks for the map runtime", () => {
    const { html, css, runtimes } = rendered(mapNode({ lat: 1, lng: 2, embed: true, height: 400 }));
    expect(runtimes).toEqual(["map"]);
    expect(html).toContain('data-emvb-map=""');
    expect(html).toContain('data-src="https://www.openstreetmap.org/export/embed.html?bbox=');
    expect(html).toContain('data-title="Map of 1 Main St" data-height="400"');
    expect(html).toContain('<button type="button" class="emvb-map-load">Show the map</button>');
    expect(html).toContain("Loads a map from OpenStreetMap.");
    expect(html.includes("<iframe")).toBe(false);
    expect(css).toContain(".emvb-map:not([data-emvb-ready]) .emvb-map-frame{display:none}");
  });

  test("an OpenStreetMap embed without coordinates stays a link; Google embeds the address", () => {
    const osm = rendered(mapNode({ embed: true }));
    expect(osm.runtimes).toEqual([]);
    expect(osm.html.includes("emvb-map-load")).toBe(false);
    const google = rendered(mapNode({ embed: true, provider: "google" }));
    expect(google.runtimes).toEqual(["map"]);
    expect(google.html).toContain(
      'data-src="https://www.google.com/maps?q=1%20Main%20St%0ASpringfield&amp;z=15&amp;output=embed"',
    );
  });

  test("refuses an empty address and coordinates off the globe", () => {
    expect(page(mapNode({ address: "" })).ok).toBe(false);
    expect(page(mapNode({ lat: 91 })).ok).toBe(false);
    expect(page(mapNode({ lng: -181 })).ok).toBe(false);
  });
});

const plan = (props: Record<string, unknown>) => ({
  id: "plan0001",
  type: "price-table",
  props: { title: "Pro", price: "29", ...props },
});

describe("Price table (W-1042)", () => {
  test("a plan card with its title, price, features and button, and no script", () => {
    const { html, runtimes } = rendered(
      plan({
        currency: "$",
        period: "per month",
        features: ["Unlimited pages", " "],
        excluded: ["Custom domain"],
        buttonText: "Choose Pro",
        buttonHref: "/signup",
      }),
    );
    expect(html).toContain('<h3 class="emvb-price-table-title">Pro</h3>');
    expect(html).toContain(
      '<p class="emvb-price-table-price"><span class="emvb-price-table-amount"><span class="emvb-price-table-currency">$</span>29</span><span class="emvb-price-table-period">per month</span></p>',
    );
    expect(html.match(/<li /g)).toHaveLength(2);
    expect(html).toContain(
      '<span class="emvb-price-table-sr">Not included: </span><span class="emvb-price-table-text">Custom domain</span>',
    );
    expect(html).toContain('<a class="emvb-price-table-button" href="/signup">Choose Pro</a>');
    expect(html.includes("emvb-price-table-ribbon")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("on sale, the regular price is struck through and both are named for screen readers", () => {
    const html = rendered(plan({ regularPrice: "49", currency: "€" })).html;
    expect(html).toContain(
      '<s class="emvb-price-table-regular"><span class="emvb-price-table-sr">Regular price: </span>€49</s><span class="emvb-price-table-amount"><span class="emvb-price-table-sr">Sale price: </span>',
    );
  });

  test("featured adds the ribbon and class; the title level can change", () => {
    const html = rendered(plan({ featured: true, ribbon: "Best value", titleLevel: 2 })).html;
    expect(html).toContain('class="emvb-price-table emvb-price-table-featured"');
    expect(html).toContain('<p class="emvb-price-table-ribbon">Best value</p>');
    expect(html).toContain('<h2 class="emvb-price-table-title">Pro</h2>');
    expect(rendered(plan({ featured: true })).html).toContain(">Featured</p>");
  });

  test("an unsafe or missing link drops the button; a new tab opens safely", () => {
    const unsafe = rendered(plan({ buttonText: "Go", buttonHref: "javascript:alert(1)" })).html;
    expect(unsafe.includes("emvb-price-table-button")).toBe(false);
    expect(rendered(plan({ buttonText: "Go" })).html.includes("emvb-price-table-button")).toBe(
      false,
    );
    const tab = rendered(
      plan({ buttonText: "Go", buttonHref: "https://x.example/", newTab: true }),
    ).html;
    expect(tab).toContain('target="_blank" rel="noopener noreferrer"');
  });

  test("refuses more than 30 features", () => {
    expect(page(plan({ features: Array.from({ length: 31 }, (_, i) => `F${i}`) })).ok).toBe(false);
  });
});

const priceRow = (props: Record<string, unknown>, id = "prow0001") => ({
  id,
  type: "price-list-item",
  props: { title: "Espresso", price: "$3", ...props },
});
const menu = (...rows: unknown[]) => ({
  id: "plst0001",
  type: "price-list",
  props: { label: "Drinks" },
  children: rows,
});

describe("Price list (W-1043)", () => {
  test("a named list of rows: title, dotted leader and price on one line, then the description", () => {
    const { html, runtimes } = rendered(menu(priceRow({ description: "A double shot." })));
    expect(html).toContain('<ul class="emvb-price-list" aria-label="Drinks">');
    expect(html).toContain(
      '<li class="emvb-price-list-item"><div class="emvb-price-list-body"><p class="emvb-price-list-head"><span class="emvb-price-list-title">Espresso</span><span class="emvb-price-list-leader" aria-hidden="true"></span><span class="emvb-price-list-price">$3</span></p><p class="emvb-price-list-desc">A double shot.</p></div></li>',
    );
    expect(runtimes).toEqual([]);
  });

  test("a picture comes first, decorative unless it has alt text; a link goes on the title", () => {
    const html = rendered(
      menu(
        priceRow({ src: "/media/espresso.jpg", href: "/espresso" }),
        priceRow({ src: "/media/tea.jpg", alt: "Green tea", title: "Tea" }, "prow0002"),
      ),
    ).html;
    expect(html).toContain('<img class="emvb-price-list-image" src="/media/espresso.jpg" alt=""');
    expect(html).toContain('alt="Green tea"');
    expect(html).toContain(
      '<span class="emvb-price-list-title"><a href="/espresso">Espresso</a></span>',
    );
    const unsafe = rendered(menu(priceRow({ src: "javascript:x", href: "javascript:x" }))).html;
    expect(unsafe.includes("javascript:")).toBe(false);
  });

  test("rows go only in a price list, and a price list holds only rows", () => {
    const issues = (...children: unknown[]) => {
      const result = page(...children);
      if (!result.ok) throw new Error("invalid");
      return nestingIssues(result.layout).length;
    };
    expect(issues(priceRow({}))).toBe(1);
    expect(
      issues({
        ...menu(),
        children: [{ id: "head0002", type: "heading", props: { text: "x", level: 2 } }],
      }),
    ).toBe(1);
    expect(issues(menu(priceRow({})))).toBe(0);
  });
});

const ctaNode = (props: Record<string, unknown>) => ({
  id: "ctab0001",
  type: "cta",
  props: { title: "Ready?", ...props },
});

describe("Call to action (W-1044)", () => {
  test("with a link, the title is the one link and the button is for the eye only", () => {
    const { html, runtimes } = rendered(
      ctaNode({ text: "Start today.", buttonText: "Get started", href: "/signup", ribbon: "New" }),
    );
    expect(html).toContain('class="emvb-cta emvb-cta-top emvb-cta-linked"');
    expect(html).toContain('<p class="emvb-cta-ribbon">New</p>');
    expect(html).toContain(
      '<h3 class="emvb-cta-title"><a class="emvb-cta-link" href="/signup">Ready?</a></h3><p class="emvb-cta-text">Start today.</p><span class="emvb-cta-button" aria-hidden="true">Get started</span>',
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(runtimes).toEqual([]);
  });

  test("the picture goes behind the words by default, decorative unless it has alt text", () => {
    const html = rendered(ctaNode({ src: "/media/hero.jpg" })).html;
    expect(html).toContain('class="emvb-cta emvb-cta-behind"');
    expect(html).toContain('<div class="emvb-cta-media"><img src="/media/hero.jpg" alt=""');
    expect(
      rendered(ctaNode({ src: "/media/hero.jpg", layout: "left", alt: "Team" })).html,
    ).toContain('class="emvb-cta emvb-cta-left"');
  });

  test("without a safe link there is no link and no button", () => {
    const html = rendered(ctaNode({ buttonText: "Go", href: "javascript:alert(1)" })).html;
    expect(html.includes("<a ")).toBe(false);
    expect(html.includes("emvb-cta-button")).toBe(false);
    expect(html.includes("emvb-cta-linked")).toBe(false);
  });

  test("the overlay behind the words keeps white text readable", () => {
    const { css } = rendered(ctaNode({ src: "/a.jpg" }));
    expect(css).toContain(".emvb-cta-behind{justify-content:center;min-height:16em;color:#fff}");
    expect(css).toContain("background:rgb(0 0 0 / 0.55)");
  });
});

const flip = (props: Record<string, unknown>) => ({
  id: "flip0001",
  type: "flip-box",
  props: { frontTitle: "Front", ...props },
});

describe("Flip box (W-1045)", () => {
  test("both faces stay in the page, with a native Turn over checkbox and no script", () => {
    const { html, runtimes } = rendered(
      flip({
        frontText: "Teaser",
        backTitle: "Back",
        backText: "Detail",
        buttonText: "Go",
        href: "/go",
      }),
    );
    expect(html).toContain('class="emvb-flip-box emvb-flip-right"');
    expect(html).toContain(
      '<div class="emvb-flip-face emvb-flip-front"><h3 class="emvb-flip-title">Front</h3><p class="emvb-flip-text">Teaser</p></div><div class="emvb-flip-face emvb-flip-back"><h3 class="emvb-flip-title">Back</h3><p class="emvb-flip-text">Detail</p><a class="emvb-flip-button" href="/go">Go</a></div>',
    );
    expect(html).toContain(
      '<label class="emvb-flip-toggle"><input type="checkbox" class="emvb-flip-check"><span>Turn over</span></label>',
    );
    expect(html.includes("aria-hidden")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("it turns on hover only where devices hover, on the checkbox, and when focus reaches the back", () => {
    const { css } = rendered(flip({ direction: "up" }));
    expect(css).toContain(
      ".emvb-flip-up:has(.emvb-flip-check:checked) .emvb-flip-inner,.emvb-flip-up:has(.emvb-flip-back :focus-visible) .emvb-flip-inner{transform:rotateX(180deg)}",
    );
    expect(css).toContain(
      "@media (hover:hover){.emvb-flip-up:hover .emvb-flip-inner{transform:rotateX(180deg)}}",
    );
    expect(css).toContain(".emvb-flip-face{grid-area:1/1;");
    expect(css).toContain("backface-visibility:hidden");
  });

  test("under reduced motion the faces swap without the turn", () => {
    expect(rendered(flip({})).css).toContain(
      "@media (prefers-reduced-motion:reduce){.emvb-flip-inner{transition:none}}",
    );
  });

  test("an unsafe link drops the button; the control text and title level can change", () => {
    const html = rendered(
      flip({ buttonText: "Go", href: "javascript:x", toggleLabel: "Show details", titleLevel: 4 }),
    ).html;
    expect(html.includes("emvb-flip-button")).toBe(false);
    expect(html).toContain("<span>Show details</span>");
    expect(html).toContain('<h4 class="emvb-flip-title">Front</h4>');
  });
});

const headlineNode = (props: Record<string, unknown>) => ({
  id: "hdln0001",
  type: "headline",
  props: { before: "We build", highlight: "fast", after: "sites", ...props },
});

describe("Animated headline (W-1046)", () => {
  test("one heading that reads as a sentence, the highlight underlined in CSS, no script", () => {
    const { html, css, runtimes } = rendered(headlineNode({}));
    expect(html).toContain(
      '<h2 class="emvb-headline emvb-headline-underline">We build <span class="emvb-headline-mark">fast</span> sites</h2>',
    );
    expect(css).toContain(
      "@media (prefers-reduced-motion:no-preference){.emvb-headline-underline .emvb-headline-mark{animation:",
    );
    expect(runtimes).toEqual([]);
  });

  test("the circle is an aria-hidden drawing around the words", () => {
    const html = rendered(headlineNode({ mark: "circle", level: 1 })).html;
    expect(html).toContain('<h1 class="emvb-headline emvb-headline-circle">');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="emvb-headline-shape"');
    expect(html).toContain('aria-hidden="true" focusable="false"><path d=');
  });

  test("rotating words ask for the headline runtime only when there are other words", () => {
    const { html, runtimes } = rendered(
      headlineNode({ rotate: ["accessible", " "], rotating: true, interval: 3, turns: 1 }),
    );
    expect(runtimes).toEqual(["headline"]);
    expect(html).toContain(
      'data-emvb-rotate="[&quot;fast&quot;,&quot;accessible&quot;]" data-interval="3" data-turns="1"',
    );
    expect(rendered(headlineNode({ rotate: ["x"] })).runtimes).toEqual([]);
    expect(rendered(headlineNode({ rotating: true })).runtimes).toEqual([]);
  });

  test("refuses empty highlighted words and too-fast rotation", () => {
    expect(page(headlineNode({ highlight: "" })).ok).toBe(false);
    expect(page(headlineNode({ interval: 1 })).ok).toBe(false);
  });
});

const shares = (props: Record<string, unknown>, ...networks: string[]) => ({
  id: "shar0001",
  type: "share-buttons",
  props,
  children: networks.map((network, i) => ({
    id: `shl0000${i}`,
    type: "share-link",
    props: { network },
  })),
});
function renderedWith(dynamic: Record<string, unknown>, ...children: unknown[]) {
  const result = page(...children);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return renderPage(result.layout, emptyDesign(), { dynamic });
}

describe("Share buttons (W-1047)", () => {
  test("each service's own share address carries the encoded page URL", () => {
    const url = "https://example.com/a page?x";
    expect(shareHref("facebook", url)).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2Fa%20page%3Fx",
    );
    expect(shareHref("x", url)).toStartWith("https://x.com/intent/post?url=https%3A%2F%2F");
    expect(shareHref("email", url)).toStartWith("mailto:?body=https%3A%2F%2F");
  });

  test("a named list of share links to this page, each named for screen readers, with no script", () => {
    const { html, runtimes } = renderedWith(
      { pageUrl: "https://example.com/post" },
      shares({ shape: "circle" }, "facebook", "email"),
    );
    expect(html).toContain(
      '<ul class="emvb-share-buttons emvb-share-circle" aria-label="Share this page">',
    );
    expect(html).toContain(
      '<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fexample.com%2Fpost" aria-label="Share on Facebook" target="_blank" rel="noopener noreferrer"><svg',
    );
    expect(html).toContain(
      '<a href="mailto:?body=https%3A%2F%2Fexample.com%2Fpost" aria-label="Share by email"><svg',
    );
    expect(html.includes("<script")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("without the page's address a public page shows no share links", () => {
    const { html } = rendered(shares({}, "facebook"));
    expect(html.includes("sharer.php")).toBe(false);
  });

  test("nativeShare adds a Share button hidden until the script runs, and asks for the share runtime", () => {
    const { html, css, runtimes } = renderedWith(
      { pageUrl: "https://example.com/" },
      shares({ nativeShare: true, label: "Share" }, "x"),
    );
    expect(runtimes).toEqual(["share"]);
    expect(html).toContain(
      '<button type="button" class="emvb-share-native" data-emvb-share="">Share…</button>',
    );
    expect(html).toContain('aria-label="Share" data-emvb-share-list=""');
    expect(css).toContain(
      ".emvb-share-buttons:not([data-emvb-ready]) .emvb-share-native-item{display:none}",
    );
  });

  test("share links go only in Share buttons, which hold only share links", () => {
    const issues = (...children: unknown[]) => {
      const result = page(...children);
      if (!result.ok) throw new Error("invalid");
      return nestingIssues(result.layout).length;
    };
    expect(issues({ id: "shl00001", type: "share-link", props: { network: "x" } })).toBe(1);
    expect(issues(shares({}, "x"))).toBe(0);
    expect(page(shares({}, "myspace")).ok).toBe(false);
  });
});

const spots = (props: Record<string, unknown>, ...markers: Record<string, unknown>[]) => ({
  id: "spot0001",
  type: "hotspots",
  props: { src: "/media/car.jpg", alt: "A car", ...props },
  children: markers.map((m, i) => ({
    id: `hspt000${i}`,
    type: "hotspot",
    props: { title: `Point ${i + 1}`, x: 20, y: 30, ...m },
  })),
});

describe("Hotspots (W-1048)", () => {
  test("a picture and a named list of numbered buttons that open their notes as popovers, no script", () => {
    const { html, runtimes } = rendered(spots({}, { title: "Wheel", text: "Alloy." }));
    expect(html).toContain('<img class="emvb-hotspots-image" src="/media/car.jpg" alt="A car"');
    expect(html).toContain('<ol class="emvb-hotspots-list" aria-label="Points on the picture">');
    expect(html).toContain(
      '<button type="button" class="emvb-hotspot-button" popovertarget="emvb-hotspot-hspt0000" aria-label="Wheel"></button><div id="emvb-hotspot-hspt0000" class="emvb-hotspot-note" popover="auto"><p class="emvb-hotspot-title">Wheel</p><p class="emvb-hotspot-text">Alloy.</p></div>',
    );
    expect(runtimes).toEqual([]);
  });

  test("each marker sits at its own place, with tablet and phone places when set", () => {
    const { css } = rendered(spots({}, { x: 20, y: 30.555, xMobile: 50 }));
    expect(css).toContain(".emvb-e-hspt0000{left:20%;top:30.56%}");
    expect(css).toContain("@media (max-width: 767.98px){.emvb-e-hspt0000{left:50%;top:30.56%}}");
  });

  test("markers are numbered by CSS and notes sit by their marker where browsers can", () => {
    const { css } = rendered(spots({}, {}));
    expect(css).toContain(".emvb-hotspot-button::before{content:counter(emvb-hotspot)}");
    expect(css).toContain("@supports (position-area:bottom){.emvb-hotspot-note{");
  });

  test("hotspots go only on a Hotspots picture; places stay on the picture", () => {
    const issues = (...children: unknown[]) => {
      const result = page(...children);
      if (!result.ok) throw new Error("invalid");
      return nestingIssues(result.layout).length;
    };
    expect(issues({ id: "hspt0009", type: "hotspot", props: { title: "x", x: 1, y: 1 } })).toBe(1);
    expect(issues(spots({}, {}))).toBe(0);
    expect(page(spots({}, { x: 101 })).ok).toBe(false);
    expect(page(spots({}, { title: "" })).ok).toBe(false);
  });
});
