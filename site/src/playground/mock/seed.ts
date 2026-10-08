import {
  DESIGN_SCHEMA_VERSION,
  LAYOUT_SCHEMA_VERSION,
  type DesignSystem,
  type Layout,
  type LayoutNode,
  type ThemePostFields,
} from "../../../../packages/emvb/src/core/index.ts";

/**
 * What a fresh playground opens with: a landing page for a made-up notes app, a Journal page
 * whose Loop shows a few fake posts, site styles that use variables and classes, a forms-plugin
 * form, and a small media library. Everything here is ordinary EmVB data.
 */

const MEDIA_BASE = "/playground/media";

export type SeedMedia = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  alt: string;
};

export const SEED_MEDIA: readonly SeedMedia[] = [
  {
    id: "media-app",
    filename: "fieldnote-app.webp",
    mimeType: "image/webp",
    size: 8510,
    width: 1200,
    height: 860,
    alt: "The Fieldnote app: a notebook list beside an open note",
  },
  {
    id: "media-notebooks",
    filename: "shared-notebooks.webp",
    mimeType: "image/webp",
    size: 9394,
    width: 1000,
    height: 760,
    alt: "Shared notebooks fanned out on a blue background",
  },
  {
    id: "media-gradient",
    filename: "soft-gradient.webp",
    mimeType: "image/webp",
    size: 5680,
    width: 900,
    height: 900,
    alt: "A soft blue and orange gradient",
  },
  {
    id: "media-avatar",
    filename: "avatar-maya.webp",
    mimeType: "image/webp",
    size: 5762,
    width: 600,
    height: 600,
    alt: "Portrait illustration of Maya",
  },
];

export const mediaUrl = (filename: string) => `${MEDIA_BASE}/${filename}`;

export const SEED_DESIGN: DesignSystem = {
  schemaVersion: DESIGN_SCHEMA_VERSION,
  variables: {
    colors: [
      { id: "ink", name: "Ink", value: "#14161a" },
      { id: "paper", name: "Paper", value: "#faf8f3" },
      { id: "brand", name: "Brand", value: "#2f5bea" },
      { id: "brand-dark", name: "Brand dark", value: "#2347c4" },
      { id: "brand-soft", name: "Brand soft", value: "#e8eefd" },
      { id: "accent", name: "Accent", value: "#f2994a" },
      { id: "muted", name: "Muted text", value: "#545b66" },
      { id: "line", name: "Line", value: "#e4dfd3" },
    ],
    fonts: [
      {
        id: "display",
        name: "Display",
        value: 'Georgia, "Times New Roman", serif',
      },
      {
        id: "body",
        name: "Body",
        value: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      },
    ],
    fontSizes: [
      { id: "lede", name: "Lede", value: { value: 1.25, unit: "rem" } },
      { id: "small", name: "Small", value: { value: 0.875, unit: "rem" } },
    ],
    spacings: [
      { id: "section", name: "Section padding", value: { value: 96, unit: "px" } },
      { id: "gutter", name: "Gutter", value: { value: 24, unit: "px" } },
    ],
  },
  classes: [
    {
      id: "card",
      name: "Card",
      style: {
        flexDirection: "column",
        gap: { value: 12, unit: "px" },
        paddingTop: { value: 28, unit: "px" },
        paddingRight: { value: 28, unit: "px" },
        paddingBottom: { value: 28, unit: "px" },
        paddingLeft: { value: 28, unit: "px" },
        backgroundColor: "#ffffff",
        borderWidth: { value: 1, unit: "px" },
        borderStyle: "solid",
        borderColor: { var: "line" },
        borderRadius: { value: 18, unit: "px" },
        transition: { duration: 200, easing: "ease-out", property: "all" },
      },
      states: {
        hover: {
          borderColor: { var: "brand" },
          boxShadow: { x: 0, y: 12, blur: 32, spread: -12, color: "#2f5bea55" },
        },
      },
    },
    {
      id: "eyebrow",
      name: "Eyebrow",
      style: {
        color: { var: "brand" },
        fontSize: { var: "small", from: "fontSize" },
        fontWeight: 600,
        letterSpacing: { value: 0.08, unit: "em" },
        textTransform: "uppercase",
      },
    },
    {
      id: "button-primary",
      name: "Button primary",
      style: {
        backgroundColor: { var: "brand" },
        color: "#ffffff",
        paddingTop: { value: 14, unit: "px" },
        paddingRight: { value: 22, unit: "px" },
        paddingBottom: { value: 14, unit: "px" },
        paddingLeft: { value: 22, unit: "px" },
        borderRadius: { value: 999, unit: "px" },
        fontWeight: 600,
        textDecoration: "none",
        transition: { duration: 150, easing: "ease-out", property: "colors" },
      },
      states: { hover: { backgroundColor: { var: "brand-dark" } } },
    },
    {
      id: "button-ghost",
      name: "Button ghost",
      style: {
        backgroundColor: "#00000000",
        color: { var: "ink" },
        paddingTop: { value: 13, unit: "px" },
        paddingRight: { value: 21, unit: "px" },
        paddingBottom: { value: 13, unit: "px" },
        paddingLeft: { value: 21, unit: "px" },
        borderWidth: { value: 1, unit: "px" },
        borderStyle: "solid",
        borderColor: { var: "ink" },
        borderRadius: { value: 999, unit: "px" },
        fontWeight: 600,
        textDecoration: "none",
      },
      states: { hover: { backgroundColor: { var: "ink" }, color: { var: "paper" } } },
    },
  ],
  defaults: {
    h1: {
      fontFamily: { var: "display", from: "font" },
      fontSize: { value: 3.5, unit: "rem" },
      fontWeight: 600,
      lineHeight: 1.08,
      letterSpacing: { value: -0.02, unit: "em" },
      color: { var: "ink" },
    },
    h2: {
      fontFamily: { var: "display", from: "font" },
      fontSize: { value: 2.4, unit: "rem" },
      fontWeight: 600,
      lineHeight: 1.15,
      letterSpacing: { value: -0.01, unit: "em" },
      color: { var: "ink" },
    },
    h3: {
      fontFamily: { var: "body", from: "font" },
      fontSize: { value: 1.2, unit: "rem" },
      fontWeight: 600,
      color: { var: "ink" },
    },
    p: {
      fontFamily: { var: "body", from: "font" },
      lineHeight: 1.6,
      color: { var: "muted" },
    },
    a: { color: { var: "brand" } },
  },
};

const px = (value: number) => ({ value, unit: "px" as const });
const pad = (y: number, x: number) => ({
  paddingTop: px(y),
  paddingBottom: px(y),
  paddingLeft: px(x),
  paddingRight: px(x),
});

/** Seed node ids are fixed, so a reset always gives the same page. */
const id = (name: string) => `pg-${name}`;

const node = (
  name: string,
  type: string,
  props: Record<string, unknown>,
  extra: Partial<Omit<LayoutNode, "id" | "type" | "props">> & { children?: LayoutNode[] } = {},
): LayoutNode => ({ id: id(name), type, props, ...extra }) as LayoutNode;

const text = (name: string, value: string, extra = {}) =>
  node(name, "text", { text: value }, extra);
const heading = (name: string, value: string, level: number, extra = {}) =>
  node(name, "heading", { text: value, level }, extra);

const feature = (key: string, icon: string, title: string, body: string) =>
  node(
    `feat-${key}`,
    "div-block",
    {},
    {
      classes: ["card"],
      children: [
        node(
          `feat-${key}-ic`,
          "icon",
          { iconId: icon, decorative: true, size: 28 },
          {
            style: {
              color: { var: "brand" },
              backgroundColor: { var: "brand-soft" },
              ...pad(10, 10),
              borderRadius: px(12),
            },
          },
        ),
        heading(`feat-${key}-h`, title, 3),
        text(`feat-${key}-t`, body),
      ],
    },
  );

const stat = (key: string, value: string, label: string) =>
  node(
    `stat-${key}`,
    "div-block",
    {},
    {
      style: { flexDirection: "column", gap: px(4), alignItems: "center" },
      children: [
        heading(`stat-${key}-v`, value, 3, {
          style: {
            fontFamily: { var: "display", from: "font" },
            fontSize: { value: 2.2, unit: "rem" },
            color: { var: "brand" },
          },
        }),
        text(`stat-${key}-l`, label, { style: { textAlign: "center" } }),
      ],
    },
  );

const faq = (key: string, q: string, a: string, open = false) =>
  node(`faq-${key}`, "accordion-item", open ? { summary: q, open: true } : { summary: q }, {
    children: [text(`faq-${key}-a`, a)],
  });

const rootNode = (...args: Parameters<typeof node>) => node(...args) as Layout["root"];

export function landingLayout(): Layout {
  const section = (
    name: string,
    children: LayoutNode[],
    style: Record<string, unknown> = {},
    extra = {},
  ) =>
    node(
      name,
      "layout-section",
      { tag: "section" },
      {
        style: {
          flexDirection: "column",
          gap: px(24),
          paddingTop: { var: "section", from: "spacing" },
          paddingBottom: { var: "section", from: "spacing" },
          paddingLeft: { var: "gutter", from: "spacing" },
          paddingRight: { var: "gutter", from: "spacing" },
          ...style,
        },
        devices: { mobile: { paddingTop: px(56), paddingBottom: px(56) } },
        children,
        ...extra,
      },
    );

  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: rootNode(
      "root",
      "container",
      {},
      {
        style: {
          flexDirection: "column",
          backgroundColor: { var: "paper" },
          fontFamily: { var: "body", from: "font" },
          color: { var: "ink" },
        },
        children: [
          node(
            "header",
            "layout-section",
            { tag: "header" },
            {
              label: "Header",
              style: { ...pad(18, 24) },
              children: [
                node(
                  "header-row",
                  "flexbox",
                  {},
                  {
                    style: {
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: px(24),
                    },
                    children: [
                      node(
                        "brand",
                        "link",
                        { text: "◆ Fieldnote", href: "#top" },
                        {
                          style: {
                            fontFamily: { var: "display", from: "font" },
                            fontSize: { value: 1.4, unit: "rem" },
                            fontWeight: 700,
                            color: { var: "ink" },
                            textDecoration: "none",
                          },
                        },
                      ),
                      node(
                        "nav",
                        "menu",
                        { direction: "row", label: "Main" },
                        {
                          style: { gap: px(28) },
                          hiddenOn: ["mobile"],
                          children: [
                            node(
                              "nav-features",
                              "menu-item",
                              { text: "Features", href: "#features" },
                              { children: [] },
                            ),
                            node(
                              "nav-stories",
                              "menu-item",
                              { text: "Stories", href: "#stories" },
                              { children: [] },
                            ),
                            node(
                              "nav-faq",
                              "menu-item",
                              { text: "FAQ", href: "#faq" },
                              { children: [] },
                            ),
                          ],
                        },
                      ),
                      node(
                        "header-cta",
                        "button",
                        { text: "Start free", href: "#signup" },
                        {
                          classes: ["button-primary"],
                          style: { ...pad(10, 18) },
                        },
                      ),
                    ],
                  },
                ),
              ],
            },
          ),
          section(
            "hero",
            [
              node(
                "hero-grid",
                "grid",
                { columns: 2, columnsTablet: 1 },
                {
                  style: { gap: px(56), alignItems: "center" },
                  children: [
                    node(
                      "hero-copy",
                      "div-block",
                      {},
                      {
                        style: { flexDirection: "column", gap: px(20) },
                        children: [
                          node(
                            "hero-eyebrow",
                            "label",
                            { text: "New · Shared notebooks" },
                            {
                              classes: ["eyebrow"],
                            },
                          ),
                          heading("hero-title", "Notes your whole team will actually read.", 1, {
                            devices: { mobile: { fontSize: { value: 2.4, unit: "rem" } } },
                          }),
                          text(
                            "hero-lede",
                            "Fieldnote turns meeting scraps, decisions and to-dos into one calm, searchable notebook. Write once, and everyone who needs it finds it.",
                            { style: { fontSize: { var: "lede", from: "fontSize" } } },
                          ),
                          node(
                            "hero-actions",
                            "flexbox",
                            {},
                            {
                              style: { flexDirection: "row", flexWrap: "wrap", gap: px(12) },
                              children: [
                                node(
                                  "hero-cta",
                                  "button",
                                  { text: "Start free", href: "#signup" },
                                  {
                                    classes: ["button-primary"],
                                  },
                                ),
                                node(
                                  "hero-tour",
                                  "button",
                                  { text: "See how it works", href: "#features" },
                                  {
                                    classes: ["button-ghost"],
                                  },
                                ),
                              ],
                            },
                          ),
                          text("hero-note", "Free for teams up to 5. No card needed.", {
                            style: { fontSize: { var: "small", from: "fontSize" } },
                          }),
                        ],
                      },
                    ),
                    node(
                      "hero-image",
                      "image",
                      {
                        src: mediaUrl("fieldnote-app.webp"),
                        alt: "The Fieldnote app: a notebook list beside an open note",
                        width: 1200,
                        height: 860,
                        mediaId: "media-app",
                        priority: true,
                      },
                      {
                        style: {
                          width: { value: 100, unit: "%" },
                          borderRadius: px(24),
                          boxShadow: { x: 0, y: 30, blur: 60, spread: -30, color: "#2f5bea66" },
                        },
                      },
                    ),
                  ],
                },
              ),
            ],
            { paddingTop: px(56) },
            { label: "Hero" },
          ),
          section(
            "stats",
            [
              node(
                "stats-grid",
                "grid",
                { columns: 3, columnsMobile: 1 },
                {
                  style: { gap: px(24) },
                  children: [
                    stat("teams", "12,000+", "teams write in Fieldnote"),
                    stat("time", "3 hrs", "saved per person, every week"),
                    stat("rating", "4.9 / 5", "average rating from reviewers"),
                  ],
                },
              ),
            ],
            {
              paddingTop: px(40),
              paddingBottom: px(40),
              borderTopWidth: px(1),
              borderBottomWidth: px(1),
              borderStyle: "solid",
              borderColor: { var: "line" },
            },
            { label: "Stats" },
          ),
          section(
            "features",
            [
              node(
                "feat-eyebrow",
                "label",
                { text: "Features" },
                {
                  classes: ["eyebrow"],
                  style: { textAlign: "center" },
                },
              ),
              heading("feat-title", "Everything in one calm place", 2, {
                style: { textAlign: "center" },
              }),
              text(
                "feat-lede",
                "Hover a card to see a class with a Hover state. Click any element on the canvas to change it.",
                {
                  style: {
                    textAlign: "center",
                    maxWidth: px(620),
                    marginLeft: "auto",
                    marginRight: "auto",
                  },
                },
              ),
              node(
                "feat-grid",
                "grid",
                { columns: 3, columnsTablet: 2, columnsMobile: 1 },
                {
                  style: { gap: px(24), marginTop: px(24) },
                  children: [
                    feature(
                      "search",
                      "search",
                      "Find anything",
                      "Search every notebook at once, including the text inside attached images.",
                    ),
                    feature(
                      "clock",
                      "clock",
                      "Decisions with dates",
                      "Every decision keeps who made it and when, so nobody re-argues last month.",
                    ),
                    feature(
                      "globe",
                      "globe",
                      "Share a page",
                      "Publish one note as a web page for clients, without giving them an account.",
                    ),
                    feature(
                      "check",
                      "circle-check",
                      "To-dos that finish",
                      "Tasks written in a note show up in one list, with owners and due dates.",
                    ),
                    feature(
                      "heart",
                      "heart",
                      "Made for focus",
                      "No badges, no streaks, no feed. Just your team's notes, quietly in sync.",
                    ),
                    feature(
                      "settings",
                      "settings",
                      "Yours to shape",
                      "Templates, tags and notebook rules per team, set up in minutes.",
                    ),
                  ],
                },
              ),
            ],
            { backgroundColor: { var: "brand-soft" } },
            { label: "Features", htmlId: "features" },
          ),
          section(
            "split",
            [
              node(
                "split-grid",
                "grid",
                { columns: 2, columnsTablet: 1 },
                {
                  style: { gap: px(56), alignItems: "center" },
                  children: [
                    node(
                      "split-image",
                      "image",
                      {
                        src: mediaUrl("shared-notebooks.webp"),
                        alt: "Shared notebooks fanned out on a blue background",
                        width: 1000,
                        height: 760,
                        mediaId: "media-notebooks",
                      },
                      { style: { width: { value: 100, unit: "%" }, borderRadius: px(24) } },
                    ),
                    node(
                      "split-copy",
                      "div-block",
                      {},
                      {
                        style: { flexDirection: "column", gap: px(18) },
                        children: [
                          node(
                            "split-eyebrow",
                            "label",
                            { text: "Shared notebooks" },
                            { classes: ["eyebrow"] },
                          ),
                          heading(
                            "split-title",
                            "One notebook per project, open to the right people",
                            2,
                          ),
                          node(
                            "split-list",
                            "list",
                            {
                              items: [
                                "Invite a client to one notebook, not your whole workspace",
                                "See who read a note, and who still needs to",
                                "Pin the decisions that matter to the top",
                              ],
                            },
                            { style: { color: { var: "muted" }, lineHeight: 1.9 } },
                          ),
                          node(
                            "split-link",
                            "link",
                            { text: "Read how teams use notebooks →", href: "#stories" },
                            {
                              style: { fontWeight: 600 },
                            },
                          ),
                        ],
                      },
                    ),
                  ],
                },
              ),
            ],
            {},
            { label: "Split" },
          ),
          section(
            "quote",
            [
              node(
                "quote-card",
                "div-block",
                {},
                {
                  style: {
                    flexDirection: "column",
                    alignItems: "center",
                    gap: px(20),
                    maxWidth: px(780),
                    marginLeft: "auto",
                    marginRight: "auto",
                  },
                  children: [
                    text(
                      "quote-text",
                      "“We stopped losing decisions in chat. Our Monday meeting went from an hour to fifteen minutes.”",
                      {
                        style: {
                          fontFamily: { var: "display", from: "font" },
                          fontSize: { value: 1.75, unit: "rem" },
                          lineHeight: 1.35,
                          color: { var: "ink" },
                          textAlign: "center",
                        },
                      },
                    ),
                    node(
                      "quote-avatar",
                      "image",
                      {
                        src: mediaUrl("avatar-maya.webp"),
                        alt: "Portrait illustration of Maya",
                        width: 600,
                        height: 600,
                        mediaId: "media-avatar",
                      },
                      {
                        style: {
                          width: px(56),
                          height: px(56),
                          borderRadius: px(999),
                          objectFit: "cover",
                        },
                      },
                    ),
                    text("quote-who", "Maya Okafor · Head of Product, Lumen Studio", {
                      style: { fontSize: { var: "small", from: "fontSize" }, textAlign: "center" },
                    }),
                  ],
                },
              ),
            ],
            {},
            { label: "Testimonial", htmlId: "stories" },
          ),
          section(
            "faq",
            [
              heading("faq-title", "Questions, answered", 2, { style: { textAlign: "center" } }),
              node(
                "faq-list",
                "accordion",
                {},
                {
                  style: {
                    maxWidth: px(760),
                    marginLeft: "auto",
                    marginRight: "auto",
                    width: { value: 100, unit: "%" },
                  },
                  children: [
                    faq(
                      "free",
                      "Is there a free plan?",
                      "Yes. Teams of up to five people use Fieldnote free, with no time limit.",
                      true,
                    ),
                    faq(
                      "import",
                      "Can we bring our old notes?",
                      "Import from Markdown, Notion, Google Docs or plain text. Folders become notebooks.",
                    ),
                    faq(
                      "offline",
                      "Does it work offline?",
                      "Every notebook you open is kept on your device and syncs when you're back online.",
                    ),
                  ],
                },
              ),
            ],
            { backgroundColor: "#ffffff" },
            { label: "FAQ", htmlId: "faq" },
          ),
          section(
            "signup",
            [
              node(
                "signup-grid",
                "grid",
                { columns: 2, columnsTablet: 1 },
                {
                  style: { gap: px(48), alignItems: "center" },
                  children: [
                    node(
                      "signup-copy",
                      "div-block",
                      {},
                      {
                        style: { flexDirection: "column", gap: px(16) },
                        children: [
                          heading("signup-title", "Try Fieldnote with your team", 2, {
                            style: { color: { var: "paper" } },
                          }),
                          text(
                            "signup-text",
                            "Leave your details and we'll set up a workspace for you. (In this playground, the form shows what happens without sending anything.)",
                            { style: { color: "#c9cdd6" } },
                          ),
                        ],
                      },
                    ),
                    node(
                      "signup-form",
                      "form",
                      { formId: "contact" },
                      {
                        style: {
                          flexDirection: "column",
                          gap: px(14),
                          backgroundColor: "#ffffff",
                          ...pad(28, 28),
                          borderRadius: px(18),
                        },
                        children: [
                          node("f-name", "text-input", {
                            field: "name",
                            label: "Name",
                            placeholder: "Maya Okafor",
                          }),
                          node("f-email", "text-input", {
                            field: "email",
                            label: "Work email",
                            placeholder: "maya@lumen.studio",
                          }),
                          node("f-message", "textarea", {
                            field: "message",
                            label: "What does your team need?",
                          }),
                          node(
                            "f-submit",
                            "submit",
                            { label: "Request a workspace" },
                            {
                              classes: ["button-primary"],
                            },
                          ),
                        ],
                      },
                    ),
                  ],
                },
              ),
            ],
            { backgroundColor: { var: "ink" } },
            { label: "Sign up", htmlId: "signup" },
          ),
          node(
            "footer",
            "layout-section",
            { tag: "footer" },
            {
              label: "Footer",
              style: { ...pad(28, 24) },
              children: [
                node(
                  "footer-row",
                  "flexbox",
                  {},
                  {
                    style: {
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: px(12),
                    },
                    children: [
                      text(
                        "footer-copy",
                        "© 2026 Fieldnote. A made-up product, built in the EmVB playground.",
                        {
                          style: { fontSize: { var: "small", from: "fontSize" } },
                        },
                      ),
                      node(
                        "footer-link",
                        "link",
                        { text: "Made with EmVB ↗", href: "https://emvb.dev", newTab: true },
                        {
                          style: { fontSize: { var: "small", from: "fontSize" }, fontWeight: 600 },
                        },
                      ),
                    ],
                  },
                ),
              ],
            },
          ),
        ],
      },
    ),
  };
}

export function journalLayout(): Layout {
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    root: rootNode(
      "j-root",
      "container",
      {},
      {
        style: {
          flexDirection: "column",
          gap: px(32),
          ...pad(72, 24),
          backgroundColor: { var: "paper" },
          fontFamily: { var: "body", from: "font" },
        },
        children: [
          node("j-eyebrow", "label", { text: "The Fieldnote journal" }, { classes: ["eyebrow"] }),
          heading("j-title", "Notes on writing things down", 1),
          text(
            "j-lede",
            "This Loop repeats its item for each post. The playground fills it with a few made-up posts; on a real site they come from EmDash.",
          ),
          node(
            "j-loop",
            "loop",
            { perPage: 6 },
            {
              style: { flexDirection: "column", gap: px(20) },
              children: [
                node(
                  "j-card",
                  "div-block",
                  {},
                  {
                    classes: ["card"],
                    children: [
                      node(
                        "j-date",
                        "post-date",
                        { format: "long" },
                        {
                          style: {
                            fontSize: { var: "small", from: "fontSize" },
                            color: { var: "muted" },
                          },
                        },
                      ),
                      node(
                        "j-post-title",
                        "post-title",
                        { level: 2 },
                        {
                          style: { fontSize: { value: 1.5, unit: "rem" } },
                        },
                      ),
                      node("j-excerpt", "post-excerpt", { maxWords: 30 }),
                      node(
                        "j-link",
                        "post-link",
                        { text: "Read the post →" },
                        { style: { fontWeight: 600 } },
                      ),
                    ],
                  },
                ),
              ],
            },
          ),
        ],
      },
    ),
  };
}

/** Made-up posts for Loops on the playground's published view. */
export const SEED_POSTS: readonly ThemePostFields[] = [
  {
    id: "post-1",
    slug: "decision-logs",
    title: "Why every team needs a decision log",
    excerpt:
      "Most arguments at work are about decisions nobody wrote down. A decision log is a single page that ends them: what was decided, by whom, and why.",
    content: "A decision log is a single page that ends re-arguing.",
    permalink: "#decision-logs",
    publishedAt: "2026-09-29",
    authorName: "Maya Okafor",
  },
  {
    id: "post-2",
    slug: "meeting-notes",
    title: "Meeting notes people actually open",
    excerpt:
      "Put the outcome first, the to-dos second and the discussion last. Readers who stop after one line still leave with what matters.",
    content: "Outcome first, to-dos second, discussion last.",
    permalink: "#meeting-notes",
    publishedAt: "2026-09-15",
    authorName: "Jonas Berg",
  },
  {
    id: "post-3",
    slug: "quiet-tools",
    title: "The case for quiet tools",
    excerpt:
      "Badges and streaks are great for engagement and terrible for focus. We built Fieldnote to be the tool you forget is there until you need it.",
    content: "Quiet tools respect attention.",
    permalink: "#quiet-tools",
    publishedAt: "2026-08-30",
    authorName: "Maya Okafor",
  },
];

/** The forms plugin's one form in the playground: field names match the landing page's form. */
export const SEED_FORM = {
  id: "contact",
  name: "Workspace request",
  slug: "workspace-request",
  status: "active",
  pages: [
    {
      fields: [
        { name: "name", type: "text", label: "Name", required: true },
        { name: "email", type: "email", label: "Work email", required: true },
        { name: "message", type: "textarea", label: "What does your team need?", required: false },
      ],
    },
  ],
  settings: { spamProtection: "honeypot", submitLabel: "Request a workspace" },
} as const;
