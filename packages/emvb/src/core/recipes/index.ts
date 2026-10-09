import { contrastRatio } from "../a11y/audit.ts";
import type { DesignSystem } from "../schema/design.ts";
import type { Layout, LayoutNode } from "../schema/layout.ts";
import type { StyleProps } from "../schema/style.ts";
import { nodeChildren, newNodeId } from "../tree-ops.ts";

type Color = NonNullable<StyleProps["color"]>;
type Size = NonNullable<StyleProps["fontSize"]>;

/** What a recipe takes from Site styles (W-320); unset parts fall back to plain values. */
export type RecipeTokens = {
  accent?: Color;
  onAccent?: Color;
  ink?: Color;
  muted?: Color;
  surface?: Color;
  display: Size;
  heading: Size;
  subheading: Size;
  body: Size;
  small: Size;
  sectionSpace: Size;
  blockSpace: Size;
  gap: Size;
  tight: Size;
  buttonClass?: string;
  cardClass?: string;
  /** Plain words for what came from the site, for the Add panel. */
  used: string[];
};

const px = (value: number): Size => ({ value, unit: "px" });

type Named = { id: string; name: string };
const words = (v: Named) => `${v.id} ${v.name}`.toLowerCase();

/** The first variable whose id or name matches a pattern, trying patterns in order. */
function pick<T extends Named>(
  list: readonly T[] | undefined,
  ...patterns: RegExp[]
): T | undefined {
  for (const pattern of patterns) {
    const found = list?.find((v) => pattern.test(words(v)));
    if (found) return found;
  }
  return undefined;
}

const byId = <T extends Named>(list: readonly T[] | undefined, ...ids: string[]): T | undefined => {
  for (const id of ids) {
    const found = list?.find((v) => v.id === id);
    if (found) return found;
  }
  return undefined;
};

/**
 * The site's colours, type scale, spacing scale and button/card classes a recipe uses (W-320).
 * Colours are matched by name (Primary, Brand, Accent; Text, Ink; Surface, Background…), sizes by
 * the Scales ids (`fs-4xl`, `space-xl`…) or similar names; anything missing falls back.
 */
export function siteTokens(design: DesignSystem): RecipeTokens {
  const { colors, fontSizes, spacings } = design.variables;
  const used: string[] = [];
  const color = (v: Named | undefined): Color | undefined => {
    if (!v) return undefined;
    used.push(v.name);
    return { var: v.id };
  };
  const sized =
    (from: "fontSize" | "spacing") =>
    (v: Named | undefined, fallback: number): Size => {
      if (!v) return px(fallback);
      used.push(v.name);
      return { var: v.id, from };
    };
  const size = sized("fontSize");
  const space = sized("spacing");
  const accentVar = pick(colors, /\b(primary|brand)\b/, /accent/, /\bmain\b/) ?? colors[0];
  const tokens: RecipeTokens = {
    display: size(byId(fontSizes, "fs-4xl", "fs-3xl") ?? pick(fontSizes, /display|hero|huge/), 48),
    heading: size(byId(fontSizes, "fs-2xl") ?? pick(fontSizes, /\bh2\b|heading (m|l)|title/), 32),
    subheading: size(byId(fontSizes, "fs-xl") ?? pick(fontSizes, /\bh3\b|heading s|subtitle/), 22),
    body: size(byId(fontSizes, "fs-m") ?? pick(fontSizes, /body|base|text m|normal/), 17),
    small: size(byId(fontSizes, "fs-s") ?? pick(fontSizes, /small|caption|text s/), 14),
    sectionSpace: space(
      byId(spacings, "space-3xl", "space-2xl") ?? pick(spacings, /section|huge|2xl|xxl/),
      80,
    ),
    blockSpace: space(byId(spacings, "space-l") ?? pick(spacings, /\blarge\b|\bl\b/), 32),
    gap: space(byId(spacings, "space-m") ?? pick(spacings, /medium|\bm\b/), 24),
    tight: space(byId(spacings, "space-xs", "space-s") ?? pick(spacings, /small|\bs\b|xs/), 12),
    used,
  };
  const accent = color(accentVar);
  if (accent) tokens.accent = accent;
  const others = colors.filter((c) => c !== accentVar);
  const ink = color(pick(others, /\b(text|ink|foreground|body)\b/, /\bdark\b|black/));
  if (ink) tokens.ink = ink;
  const muted = color(pick(others, /muted|subtle|grey|gray|secondary text/));
  if (muted) tokens.muted = muted;
  const surface = color(pick(others, /surface|background|\bbg\b|light|canvas/));
  if (surface) tokens.surface = surface;
  const onAccent = color(pick(others, /on[- ]?(primary|brand|accent)|inverse|white/));
  if (onAccent) tokens.onAccent = onAccent;
  else if (accentVar && /^#[0-9a-f]{6}$/i.test(accentVar.value)) {
    // No "on accent" colour: white or near-black, whichever reads better on the accent.
    tokens.onAccent =
      contrastRatio(accentVar.value, "#ffffff") >= contrastRatio(accentVar.value, "#111111")
        ? "#ffffff"
        : "#111111";
  }
  const buttonCls = pick(design.classes, /\b(button|btn)\b/, /cta/);
  if (buttonCls) {
    tokens.buttonClass = buttonCls.id;
    used.push(`.${buttonCls.name}`);
  }
  const cardCls = pick(design.classes, /\bcard\b/, /tile|panel|box/);
  if (cardCls) {
    tokens.cardClass = cardCls.id;
    used.push(`.${cardCls.name}`);
  }
  tokens.used = [...new Set(used)];
  return tokens;
}

type Draft = Omit<LayoutNode, "id"> & { children?: Draft[] };

const pad = (block: Size, inline: Size = px(24)): StyleProps => ({
  paddingTop: block,
  paddingBottom: block,
  paddingLeft: inline,
  paddingRight: inline,
});

const withClass = (draft: Draft, cls: string | undefined): Draft =>
  cls ? { ...draft, classes: [cls] } : draft;

const heading = (text: string, level: number, fontSize: Size, extra: StyleProps = {}): Draft =>
  ({ type: "heading", props: { text, level }, style: { fontSize, ...extra } }) as Draft;
const text = (value: string, t: RecipeTokens, extra: StyleProps = {}): Draft =>
  ({
    type: "text",
    props: { text: value },
    style: { fontSize: t.body, ...(t.muted ? { color: t.muted } : {}), ...extra },
  }) as Draft;

function button(label: string, t: RecipeTokens, primary = true): Draft {
  if (t.buttonClass) {
    return withClass({ type: "button", props: { text: label, href: "#" } } as Draft, t.buttonClass);
  }
  const style: StyleProps = {
    paddingTop: px(12),
    paddingBottom: px(12),
    paddingLeft: px(24),
    paddingRight: px(24),
    borderRadius: px(8),
    fontWeight: 600,
  };
  if (primary && t.accent) {
    style.backgroundColor = t.accent;
    style.color = t.onAccent ?? "#ffffff";
  } else if (t.accent) {
    style.color = t.accent;
    style.borderWidth = px(1);
    style.borderStyle = "solid";
    style.borderColor = t.accent;
  }
  return { type: "button", props: { text: label, href: "#" }, style } as Draft;
}

const flex = (children: Draft[], style: StyleProps): Draft =>
  ({
    type: "flexbox",
    props: {},
    style: { flexDirection: "row", flexWrap: "wrap", ...style },
    children,
  }) as Draft;
const column = (children: Draft[], style: StyleProps = {}): Draft =>
  ({
    type: "flexbox",
    props: {},
    style: { flexDirection: "column", flexWrap: "nowrap", ...style },
    children,
  }) as Draft;
const grid = (columns: number, children: Draft[], t: RecipeTokens): Draft =>
  ({
    type: "grid",
    props: { columns, columnsTablet: Math.min(columns, 2), columnsMobile: 1 },
    style: { gap: t.gap },
    children,
  }) as Draft;

function band(t: RecipeTokens, children: Draft[], extra: StyleProps = {}): Draft {
  return {
    type: "layout-section",
    props: { tag: "section" },
    style: { ...pad(t.sectionSpace), ...extra },
    children,
  } as Draft;
}

function card(t: RecipeTokens, children: Draft[]): Draft {
  const base = column(children, { gap: t.tight });
  if (t.cardClass) return withClass(base, t.cardClass);
  return {
    ...base,
    style: {
      ...base.style,
      ...pad(t.blockSpace, t.blockSpace),
      borderRadius: px(12),
      borderWidth: px(1),
      borderStyle: "solid",
      borderColor: "#e5e7eb",
      ...(t.surface ? { backgroundColor: t.surface } : {}),
    },
  };
}

type Options = { topLevel: 1 | 2 };

/** Section recipes (W-320): whole sections built from the site's own tokens. */
export const SECTION_RECIPES = [
  {
    id: "hero",
    name: "Hero",
    description: "Big headline, a line of text and two buttons.",
    build: (t: RecipeTokens, o: Options): Draft =>
      band(
        t,
        [
          column(
            [
              heading("Say what you do in one line", o.topLevel, t.display, {
                ...(t.ink ? { color: t.ink } : {}),
                lineHeight: 1.1,
              }),
              text("A sentence or two on who it's for and why it's better.", t, {
                fontSize: t.subheading,
                maxWidth: px(640),
              }),
              flex([button("Get started", t), button("Learn more", t, false)], {
                gap: t.tight,
                justifyContent: "center",
                marginTop: t.tight,
              }),
            ],
            { gap: t.gap, alignItems: "center", textAlign: "center" },
          ),
        ],
        t.surface ? { backgroundColor: t.surface } : {},
      ),
  },
  {
    id: "features",
    name: "Features",
    description: "A heading over three cards.",
    build: (t: RecipeTokens): Draft =>
      band(t, [
        column(
          [
            heading("Why people choose us", 2, t.heading, {
              textAlign: "center",
            }),
            grid(
              3,
              ["Fast", "Simple", "Yours"].map((title) =>
                card(t, [
                  heading(title, 3, t.subheading),
                  text("One or two sentences about this benefit.", t),
                ]),
              ),
              t,
            ),
          ],
          { gap: t.blockSpace },
        ),
      ]),
  },
  {
    id: "cta",
    name: "Call to action",
    description: "A coloured band with a headline and a button.",
    build: (t: RecipeTokens): Draft =>
      band(
        t,
        [
          column(
            [
              heading(
                "Ready to start?",
                2,
                t.heading,
                t.accent ? { color: t.onAccent ?? "#ffffff" } : {},
              ),
              text(
                "Tell visitors what happens when they click.",
                t,
                t.accent ? { color: t.onAccent ?? "#ffffff" } : {},
              ),
              t.accent && !t.buttonClass
                ? ({
                    type: "button",
                    props: { text: "Start now", href: "#" },
                    style: {
                      paddingTop: px(12),
                      paddingBottom: px(12),
                      paddingLeft: px(28),
                      paddingRight: px(28),
                      borderRadius: px(8),
                      fontWeight: 600,
                      backgroundColor: t.onAccent ?? "#ffffff",
                      color: t.accent,
                    },
                  } as Draft)
                : button("Start now", t),
            ],
            { gap: t.gap, alignItems: "center", textAlign: "center" },
          ),
        ],
        t.accent ? { backgroundColor: t.accent } : {},
      ),
  },
  {
    id: "testimonial",
    name: "Testimonial",
    description: "A quote with the person's name.",
    build: (t: RecipeTokens): Draft =>
      band(t, [
        column(
          [
            text("“EmVB made our site feel like ours again. We ship pages in minutes.”", t, {
              fontSize: t.subheading,
              ...(t.ink ? { color: t.ink } : {}),
              maxWidth: px(720),
            }),
            text("Alex Doe, Founder at Example", t, { fontSize: t.small, fontWeight: 600 }),
          ],
          { gap: t.gap, alignItems: "center", textAlign: "center" },
        ),
      ]),
  },
  {
    id: "stats",
    name: "Stats",
    description: "Three numbers that prove it.",
    build: (t: RecipeTokens): Draft =>
      band(t, [
        grid(
          3,
          [
            ["10k+", "Happy customers"],
            ["99.9%", "Uptime"],
            ["24/7", "Support"],
          ].map(([value, label]) =>
            column(
              [
                text(value ?? "", t, {
                  fontSize: t.display,
                  fontWeight: 700,
                  ...(t.accent ? { color: t.accent } : {}),
                }),
                text(label ?? "", t, { fontSize: t.small }),
              ],
              { gap: t.tight, alignItems: "center", textAlign: "center" },
            ),
          ),
          t,
        ),
      ]),
  },
  {
    id: "faq",
    name: "FAQ",
    description: "Questions that open to their answers, no script.",
    build: (t: RecipeTokens): Draft =>
      band(t, [
        column(
          [
            heading("Questions and answers", 2, t.heading),
            {
              type: "accordion",
              props: {},
              children: [
                ["How long does it take?", "Most people are set up in an afternoon."],
                ["Can I cancel?", "Any time, from your account page."],
                ["Do you offer support?", "Yes, by email, every day."],
              ].map(([q, a]) => ({
                type: "accordion-item",
                props: { summary: q ?? "" },
                children: [text(a ?? "", t)],
              })),
            } as Draft,
          ],
          { gap: t.blockSpace, maxWidth: px(760) },
        ),
      ]),
  },
] as const;

export type RecipeId = (typeof SECTION_RECIPES)[number]["id"];

function hasH1(node: LayoutNode): boolean {
  const props = node.props as Record<string, unknown>;
  if (node.type === "heading" && props["level"] === 1) return true;
  if (node.type === "post-title") return true;
  return nodeChildren(node).some(hasH1);
}

function withIds(draft: Draft, random: () => number): LayoutNode {
  const { children, ...rest } = draft;
  const node = { ...rest, id: newNodeId(random) } as LayoutNode;
  if (!children) return node;
  return { ...node, children: children.map((child) => withIds(child, random)) } as LayoutNode;
}

/**
 * A recipe's section, adapted to the site's styles (W-320). The hero's headline is the page's
 * H1 only when the page has none yet. Ids are new; pass the result through `withFreshIds` (or
 * `addNodeNear`) as for any new element.
 */
export function recipeNode(
  id: string,
  design: DesignSystem,
  layout: Layout | null,
  random: () => number = Math.random,
): LayoutNode | undefined {
  const recipe = SECTION_RECIPES.find((r) => r.id === id);
  if (!recipe) return undefined;
  const topLevel = layout && hasH1(layout.root) ? 2 : 1;
  const node = withIds(recipe.build(siteTokens(design), { topLevel }), random);
  return { ...node, label: recipe.name } as LayoutNode;
}
