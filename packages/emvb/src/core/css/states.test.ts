import { describe, expect, test } from "bun:test";
import { CSS_INJECTION_CORPUS } from "../../../test/fixtures/xss.ts";
import { renderPage } from "../render/index.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { DESIGN_SCHEMA_VERSION, type DesignSystem } from "../schema/design.ts";
import type { StyleStates } from "../schema/style.ts";

const px = (value: number) => ({ value, unit: "px" as const });

const design: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: {
    colors: [{ id: "ink", name: "Ink", value: "#112233" }],
    fonts: [],
    fontSizes: [],
    spacings: [],
  },
  classes: [
    {
      id: "card",
      name: "Card",
      style: { color: "#000000" },
      states: {
        active: { opacity: 0.5 },
        hover: { color: "#ff0000" },
        focus: { borderColor: "#00ff00" },
      },
    },
  ],
};

const button = (extra: Partial<LayoutNode> = {}) =>
  ({
    id: "btn00001",
    type: "button",
    props: { text: "Go", href: "/go" },
    classes: ["card"],
    ...extra,
  }) as LayoutNode;

const page = (node: LayoutNode): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children: [node] },
});

const localStates: StyleStates = {
  focus: { backgroundColor: { var: "ink" } },
  hover: { color: "#0000ff", paddingTop: px(4) },
  active: { color: "#00ffff" },
};

/** Focus also matches a Heading's or Icon's inner link (W-242). */
const focus = (selector: string) =>
  `${selector}:focus-visible,${selector}:has(> :is(.emvb-heading-link,.emvb-icon-link):focus-visible)`;

const cssOf = (node: LayoutNode, mode: "public" | "editor" = "public") =>
  renderPage(page(node), design, { mode }).css;

describe("state style CSS (W-089)", () => {
  test("rules follow the cascade: class base, class states, local base, local states", () => {
    const css = cssOf(button({ style: { opacity: 0.9 }, states: localStates }));
    const order = [
      ".emvb-k-card{color:#000000}",
      ".emvb-k-card:hover{color:#ff0000}",
      `${focus(".emvb-k-card")}{border-color:#00ff00}`,
      ".emvb-k-card:active{opacity:0.5}",
      ".emvb-e-btn00001{opacity:0.9}",
      ".emvb-e-btn00001:hover{color:#0000ff;padding-top:4px}",
      `${focus(".emvb-e-btn00001")}{background-color:var(--emvb-c-ink)}`,
      ".emvb-e-btn00001:active{color:#00ffff}",
    ];
    const at = order.map((rule) => css.indexOf(rule));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].toSorted((a, b) => a - b));
  });

  test("focus is keyboard focus: :focus-visible, never plain :focus", () => {
    const css = cssOf(button({ states: localStates }));
    expect(css).toContain(`${focus(".emvb-e-btn00001")}{`);
    expect(css).not.toMatch(/:focus[{,)]/);
  });

  test("a linked Heading or Icon takes its Focus state when its inner link has keyboard focus (W-242)", () => {
    const icon: LayoutNode = {
      id: "icn00001",
      type: "icon",
      props: { iconId: "star", title: "Home", href: "/" },
      states: { focus: { iconScale: 1.2 } },
    };
    const { html, css } = renderPage(page(icon), design);
    expect(html).toContain('<span class="emvb-icon emvb-e-icn00001"><a class="emvb-icon-link"');
    expect(css).toContain(`${focus(".emvb-e-icn00001")}{scale:1.2}`);
    const heading: LayoutNode = {
      id: "hdg00001",
      type: "heading",
      props: { text: "Plans", level: 2, href: "/plans" },
      states: { focus: { color: "#ff0000" } },
    };
    const linked = renderPage(page(heading), design);
    expect(linked.html).toContain('class="emvb-heading-link"');
    expect(linked.css).toContain(`${focus(".emvb-e-hdg00001")}{color:#ff0000}`);
  });

  test("an element with only state styles still gets its local class and rules", () => {
    const { html, css } = renderPage(page(button({ states: { hover: { opacity: 0.4 } } })), design);
    expect(html).toContain("emvb-e-btn00001");
    expect(css).toContain(".emvb-e-btn00001:hover{opacity:0.4}");
    expect(css).not.toContain(".emvb-e-btn00001{");
  });

  test("public CSS has no preview selectors; the editor canvas repeats each state for data-emvb-state", () => {
    const node = button({ states: localStates });
    expect(cssOf(node)).not.toContain("data-emvb-state");
    const editor = cssOf(node, "editor");
    for (const [state, live] of [
      ["hover", (sel: string) => `${sel}:hover`],
      ["focus", focus],
      ["active", (sel: string) => `${sel}:active`],
    ] as const) {
      expect(editor).toContain(`${live(".emvb-k-card")},.emvb-k-card[data-emvb-state="${state}"]{`);
      expect(editor).toContain(
        `${live(".emvb-e-btn00001")},.emvb-e-btn00001[data-emvb-state="${state}"]{`,
      );
    }
  });

  test.each(CSS_INJECTION_CORPUS)(
    "state value %p never reaches the stylesheet, even when schema validation is skipped",
    (value) => {
      const node = button({
        classes: [],
        states: { hover: { color: value }, active: { opacity: 0.5 } },
      } as unknown as Partial<LayoutNode>);
      const result = renderPage(page(node), design);
      expect(result.css).not.toContain(value);
      expect(result.css).not.toMatch(/url\(|expression\(|<\/style|@import/i);
      expect(result.css).toContain(".emvb-e-btn00001:active{opacity:0.5}");
      expect(result.css).not.toContain(".emvb-e-btn00001:hover");
      expect(result.warnings).toContainEqual({
        nodeId: "btn00001",
        code: "rejected-style",
        detail: "hover.color",
      });
    },
  );

  test("an unknown state name is dropped with a warning, and unsafe class states are dropped", () => {
    const forged = {
      ...design,
      classes: [{ id: "card", name: "Card", style: {}, states: { hover: { color: "red;}" } } }],
    } as DesignSystem;
    const result = renderPage(
      page(button({ states: { visited: { color: "#ff0000" } } } as unknown as Partial<LayoutNode>)),
      forged,
    );
    expect(result.css).not.toContain("visited");
    expect(result.css).not.toContain(":hover");
    expect(result.warnings).toContainEqual({
      nodeId: "btn00001",
      code: "rejected-style",
      detail: "visited",
    });
  });

  test("an unknown colour variable in a state is reported", () => {
    const result = renderPage(
      page(button({ states: { hover: { color: { var: "gone" } } } })),
      design,
    );
    expect(result.warnings).toContainEqual({
      nodeId: "btn00001",
      code: "unknown-variable",
      detail: "gone",
    });
  });
});
