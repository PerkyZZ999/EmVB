import type { TemplateData } from "./types.ts";

/*
 * W-1068: the starter sections, as plain layout JSON. Colours, sizes and spacing are `tpl-*`
 * variable references and the button and card classes are `tpl-button` and `tpl-card`; on insert
 * `resolveTemplateNode` swaps them for the site's own Site styles (or neutral fallbacks). No
 * pictures: decorative shapes and colours only, so nothing points at media the site lacks.
 */

const px = (value: number) => ({ value, unit: "px" });
const color = (token: string) => ({ var: `tpl-${token}` });
const font = (token: string) => ({ var: `tpl-${token}`, from: "fontSize" });
const space = (token: string) => ({ var: `tpl-${token}`, from: "spacing" });

const band = {
  paddingTop: space("section"),
  paddingBottom: space("section"),
  paddingLeft: px(24),
  paddingRight: px(24),
};
const wide = { contentWidth: px(1120) };
const centred = { alignItems: "center", textAlign: "center" };
const column = { flexDirection: "column", flexWrap: "nowrap" };
const lead = { fontSize: font("subheading"), color: color("muted") };
const body = { fontSize: font("body"), color: color("muted") };
const card = {
  paddingTop: space("block"),
  paddingBottom: space("block"),
  paddingLeft: space("block"),
  paddingRight: space("block"),
  borderRadius: px(12),
  borderWidth: px(1),
  borderStyle: "solid",
  borderColor: color("line"),
  backgroundColor: color("surface"),
};
const primaryButton = {
  paddingTop: px(12),
  paddingBottom: px(12),
  paddingLeft: px(24),
  paddingRight: px(24),
  borderRadius: px(8),
  fontWeight: 600,
  backgroundColor: color("accent"),
  color: color("on-accent"),
};
const secondaryButton = {
  paddingTop: px(12),
  paddingBottom: px(12),
  paddingLeft: px(24),
  paddingRight: px(24),
  borderRadius: px(8),
  fontWeight: 600,
  borderWidth: px(1),
  borderStyle: "solid",
  borderColor: color("line"),
};
const sectionHeader = (id: string, title: string, text: string): TemplateData => ({
  id: `${id}-head`,
  type: "flexbox",
  props: {},
  style: {
    ...column,
    ...centred,
    gap: space("tight"),
    maxWidth: px(720),
    marginLeft: "auto",
    marginRight: "auto",
  },
  children: [
    {
      id: `${id}-title`,
      type: "heading",
      props: { text: title, level: 2 },
      style: { fontSize: font("heading"), color: color("ink") },
    },
    { id: `${id}-intro`, type: "text", props: { text }, style: lead },
  ],
});

export type SectionTemplate = {
  id: string;
  name: string;
  description: string;
  node: TemplateData;
};

export const SECTION_TEMPLATES: readonly SectionTemplate[] = [
  {
    id: "hero",
    name: "Hero",
    description: "A big headline, a line of text and two buttons.",
    node: {
      id: "hero-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: { ...band, backgroundColor: color("surface") },
      children: [
        {
          id: "hero-body",
          type: "flexbox",
          props: {},
          style: {
            ...column,
            ...centred,
            gap: space("gap"),
            maxWidth: px(760),
            marginLeft: "auto",
            marginRight: "auto",
          },
          children: [
            {
              id: "hero-title",
              type: "heading",
              props: { text: "Say what you do in one clear line", level: 1 },
              style: { fontSize: font("display"), lineHeight: 1.1, color: color("ink") },
            },
            {
              id: "hero-text",
              type: "text",
              props: {
                text: "A sentence or two on who this is for and how it helps them. Replace this text with your own.",
              },
              style: lead,
            },
            {
              id: "hero-actions",
              type: "flexbox",
              props: {},
              style: {
                flexDirection: "row",
                flexWrap: "wrap",
                gap: space("tight"),
                justifyContent: "center",
              },
              children: [
                {
                  id: "hero-primary",
                  type: "button",
                  props: { text: "Get started", href: "#" },
                  classes: ["tpl-button"],
                  style: primaryButton,
                },
                {
                  id: "hero-second",
                  type: "button",
                  props: { text: "See how it works", href: "#" },
                  style: secondaryButton,
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "intro",
    name: "Page intro",
    description: "The page title and a short introduction, for inner pages.",
    node: {
      id: "intro-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: { ...band, paddingBottom: space("block") },
      children: [
        {
          id: "intro-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("gap"), maxWidth: px(760) },
          children: [
            {
              id: "intro-title",
              type: "heading",
              props: { text: "Page title", level: 1 },
              style: { fontSize: font("display"), lineHeight: 1.1, color: color("ink") },
            },
            {
              id: "intro-text",
              type: "text",
              props: {
                text: "One or two sentences that introduce this page and what visitors will find on it.",
              },
              style: lead,
            },
          ],
        },
      ],
    },
  },
  {
    id: "features",
    name: "Features",
    description: "A heading over three benefits with icons.",
    node: {
      id: "feat-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "feat-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            sectionHeader(
              "feat",
              "Why people choose us",
              "A short line that sums up the benefits below.",
            ),
            {
              id: "feat-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 3, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                [
                  "feat-one",
                  "circle-check",
                  "Simple to use",
                  "Explain the first benefit in a sentence or two.",
                ],
                [
                  "feat-two",
                  "clock",
                  "Saves time",
                  "Explain the second benefit in a sentence or two.",
                ],
                [
                  "feat-three",
                  "heart",
                  "Made for you",
                  "Explain the third benefit in a sentence or two.",
                ],
              ].map(([id, iconId, title, text]) => ({
                id: id ?? "",
                type: "icon-box",
                props: { iconId, iconSize: 32, title, text },
                classes: ["tpl-card"],
                style: card,
              })),
            },
          ],
        },
      ],
    },
  },
  {
    id: "stats",
    name: "Stats",
    description: "Three numbers that show what you have done.",
    node: {
      id: "stat-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "stat-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            {
              id: "stat-title",
              type: "heading",
              props: { text: "Results so far", level: 2 },
              style: { fontSize: font("heading"), color: color("ink"), textAlign: "center" },
            },
            {
              id: "stat-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 3, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                ["stat-one", "500+", "Happy customers"],
                ["stat-two", "12", "Years of experience"],
                ["stat-three", "24/7", "Friendly support"],
              ].map(([id, value, label]) => ({
                id: id ?? "",
                type: "flexbox",
                props: {},
                style: { ...column, ...centred, gap: space("tight") },
                children: [
                  {
                    id: `${id}-value`,
                    type: "text",
                    props: { text: value },
                    style: {
                      fontSize: font("display"),
                      fontWeight: 700,
                      lineHeight: 1.1,
                      color: color("ink"),
                    },
                  },
                  { id: `${id}-label`, type: "text", props: { text: label }, style: body },
                ],
              })),
            },
          ],
        },
      ],
    },
  },
  {
    id: "testimonials",
    name: "Testimonials",
    description: "Three customer quotes with names and star ratings.",
    node: {
      id: "quote-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "quote-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            sectionHeader(
              "quote",
              "What our customers say",
              "Real words from real people build trust.",
            ),
            {
              id: "quote-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 1, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                [
                  "quote-one",
                  "Setting up took an afternoon, and our visitors noticed the difference straight away.",
                  "Alex Morgan",
                  "Owner, Example Studio",
                ],
                [
                  "quote-two",
                  "Clear, friendly and quick. Exactly what we were looking for.",
                  "Jordan Lee",
                  "Manager, Example Shop",
                ],
                [
                  "quote-three",
                  "We would recommend them to anyone who wants things done well.",
                  "Sam Rivera",
                  "Founder, Example Co.",
                ],
              ].map(([id, quote, name, role]) => ({
                id: id ?? "",
                type: "testimonial",
                props: { quote, name, role, rating: 5 },
                classes: ["tpl-card"],
                style: card,
              })),
            },
          ],
        },
      ],
    },
  },
  {
    id: "pricing",
    name: "Pricing",
    description: "Three plans side by side, the middle one featured.",
    node: {
      id: "price-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "price-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            sectionHeader(
              "price",
              "Simple, clear pricing",
              "Pick the plan that fits. Change or cancel at any time.",
            ),
            {
              id: "price-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 1, columnsMobile: 1 },
              style: { gap: space("gap"), alignItems: "stretch" },
              children: [
                {
                  id: "price-one",
                  type: "price-table",
                  props: {
                    title: "Starter",
                    description: "For trying things out.",
                    currency: "$",
                    price: "0",
                    period: "per month",
                    features: ["One project", "Email support"],
                    buttonText: "Choose Starter",
                    buttonHref: "#",
                  },
                },
                {
                  id: "price-two",
                  type: "price-table",
                  props: {
                    title: "Pro",
                    description: "For growing teams.",
                    currency: "$",
                    price: "29",
                    period: "per month",
                    features: ["Unlimited projects", "Priority support", "Team members"],
                    buttonText: "Choose Pro",
                    buttonHref: "#",
                    featured: true,
                    ribbon: "Most popular",
                  },
                },
                {
                  id: "price-three",
                  type: "price-table",
                  props: {
                    title: "Business",
                    description: "For larger organisations.",
                    currency: "$",
                    price: "99",
                    period: "per month",
                    features: ["Everything in Pro", "Dedicated contact", "Custom setup"],
                    buttonText: "Contact us",
                    buttonHref: "#",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "faq",
    name: "FAQ",
    description: "Questions that open to show their answers, with no script.",
    node: {
      id: "faq-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "faq-body",
          type: "flexbox",
          props: {},
          style: {
            ...column,
            gap: space("block"),
            maxWidth: px(760),
            marginLeft: "auto",
            marginRight: "auto",
          },
          children: [
            {
              id: "faq-title",
              type: "heading",
              props: { text: "Questions and answers", level: 2 },
              style: { fontSize: font("heading"), color: color("ink"), textAlign: "center" },
            },
            {
              id: "faq-list",
              type: "accordion",
              props: {},
              children: [
                [
                  "faq-one",
                  "How do I get started?",
                  "Explain the first step in a sentence or two.",
                ],
                [
                  "faq-two",
                  "How much does it cost?",
                  "Give a short, honest answer and point to the details.",
                ],
                [
                  "faq-three",
                  "Can I change my mind later?",
                  "Say what happens if someone wants to cancel or change.",
                ],
                [
                  "faq-four",
                  "How can I reach you?",
                  "List the best way to contact you and when you reply.",
                ],
              ].map(([id, summary, answer]) => ({
                id: id ?? "",
                type: "accordion-item",
                props: { summary },
                children: [
                  { id: `${id}-answer`, type: "text", props: { text: answer }, style: body },
                ],
              })),
            },
          ],
        },
      ],
    },
  },
  {
    id: "team",
    name: "Team",
    description: "Four people with their roles, ready for photos later.",
    node: {
      id: "team-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "team-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            sectionHeader("team", "Meet the team", "The people behind the work."),
            {
              id: "team-grid",
              type: "grid",
              props: { columns: 4, columnsTablet: 2, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                ["team-one", "Alex Morgan", "Founder"],
                ["team-two", "Jordan Lee", "Designer"],
                ["team-three", "Sam Rivera", "Developer"],
                ["team-four", "Casey Kim", "Support"],
              ].map(([id, name, role]) => ({
                id: id ?? "",
                type: "flexbox",
                props: {},
                classes: ["tpl-card"],
                style: { ...card, ...column, ...centred, gap: space("tight") },
                children: [
                  {
                    id: `${id}-shape`,
                    type: "div-block",
                    props: {},
                    style: {
                      width: px(72),
                      height: px(72),
                      borderRadius: px(999),
                      backgroundColor: color("accent"),
                      opacity: 0.85,
                    },
                    children: [],
                  },
                  {
                    id: `${id}-name`,
                    type: "heading",
                    props: { text: name, level: 3 },
                    style: { fontSize: font("subheading"), color: color("ink") },
                  },
                  { id: `${id}-role`, type: "text", props: { text: role }, style: body },
                ],
              })),
            },
          ],
        },
      ],
    },
  },
  {
    id: "cta",
    name: "Call to action",
    description: "A coloured band with a headline and one button.",
    node: {
      id: "cta-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: { ...band, backgroundColor: color("accent") },
      children: [
        {
          id: "cta-body",
          type: "flexbox",
          props: {},
          style: { ...column, ...centred, gap: space("gap") },
          children: [
            {
              id: "cta-title",
              type: "heading",
              props: { text: "Ready to get started?", level: 2 },
              style: { fontSize: font("heading"), color: color("on-accent") },
            },
            {
              id: "cta-text",
              type: "text",
              props: { text: "Tell visitors what happens when they click the button." },
              style: { fontSize: font("body"), color: color("on-accent") },
            },
            {
              id: "cta-button",
              type: "button",
              props: { text: "Start now", href: "#" },
              style: {
                ...primaryButton,
                backgroundColor: color("on-accent"),
                color: color("accent"),
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: "contact",
    name: "Contact details",
    description: "Email, phone and address, plus opening hours.",
    node: {
      id: "contact-band",
      type: "layout-section",
      props: { tag: "section", ...wide },
      style: band,
      children: [
        {
          id: "contact-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("block") },
          children: [
            sectionHeader("contact", "Get in touch", "We usually reply within one working day."),
            {
              id: "contact-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 3, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                {
                  id: "contact-mail",
                  type: "icon-box",
                  props: {
                    iconId: "mail",
                    iconSize: 32,
                    title: "Email",
                    text: "hello@example.com",
                    href: "mailto:hello@example.com",
                  },
                  classes: ["tpl-card"],
                  style: card,
                },
                {
                  id: "contact-phone",
                  type: "icon-box",
                  props: {
                    iconId: "phone",
                    iconSize: 32,
                    title: "Phone",
                    text: "+1 555 0100",
                    href: "tel:+15550100",
                  },
                  classes: ["tpl-card"],
                  style: card,
                },
                {
                  id: "contact-visit",
                  type: "icon-box",
                  props: {
                    iconId: "house",
                    iconSize: 32,
                    title: "Visit",
                    text: "1 Example Street, Your City",
                  },
                  classes: ["tpl-card"],
                  style: card,
                },
              ],
            },
            {
              id: "contact-hours",
              type: "text",
              props: { text: "Opening hours: Monday to Friday, 9:00 to 17:00." },
              style: { ...body, textAlign: "center" },
            },
          ],
        },
      ],
    },
  },
  {
    id: "footer",
    name: "Footer",
    description: "Your name, a tagline, two columns of links and a copyright line.",
    node: {
      id: "foot-band",
      type: "layout-section",
      props: { tag: "footer", ...wide },
      style: {
        paddingTop: space("block"),
        paddingBottom: space("block"),
        paddingLeft: px(24),
        paddingRight: px(24),
        backgroundColor: color("surface"),
      },
      children: [
        {
          id: "foot-body",
          type: "flexbox",
          props: {},
          style: { ...column, gap: space("gap") },
          children: [
            {
              id: "foot-grid",
              type: "grid",
              props: { columns: 3, columnsTablet: 3, columnsMobile: 1 },
              style: { gap: space("gap") },
              children: [
                {
                  id: "foot-brand",
                  type: "flexbox",
                  props: {},
                  style: { ...column, gap: space("tight") },
                  children: [
                    {
                      id: "foot-name",
                      type: "text",
                      props: { text: "Your company" },
                      style: { fontSize: font("subheading"), fontWeight: 700, color: color("ink") },
                    },
                    {
                      id: "foot-tagline",
                      type: "text",
                      props: { text: "A short line about what you do." },
                      style: body,
                    },
                  ],
                },
                ...[
                  [
                    "foot-pages",
                    "Pages",
                    [
                      ["Home", "/"],
                      ["About", "/about"],
                      ["Contact", "/contact"],
                    ],
                  ],
                  [
                    "foot-legal",
                    "Legal",
                    [
                      ["Privacy", "/privacy"],
                      ["Terms", "/terms"],
                    ],
                  ],
                ].map(([id, title, links]) => ({
                  id: String(id),
                  type: "flexbox",
                  props: {},
                  style: { ...column, gap: space("tight") },
                  children: [
                    {
                      id: `${id}-title`,
                      type: "text",
                      props: { text: title },
                      style: { fontSize: font("body"), fontWeight: 600, color: color("ink") },
                    },
                    ...(links as string[][]).map(([text, href], n) => ({
                      id: `${id}-${n + 1}`,
                      type: "link",
                      props: { text, href },
                      style: { fontSize: font("body"), color: color("ink") },
                    })),
                  ],
                })),
              ],
            },
            {
              id: "foot-rule",
              type: "divider",
              props: {},
              style: { borderColor: color("line") },
            },
            {
              id: "foot-copy",
              type: "text",
              props: { text: "© Your company. All rights reserved." },
              style: { fontSize: font("small"), color: color("muted") },
            },
          ],
        },
      ],
    },
  },
];
