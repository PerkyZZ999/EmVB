/**
 * Demo content for the project-site screenshots: a fictional hiking company, "Northfold".
 * Everything here is a valid EmVB layout or design document (schema 9) for the Node demo.
 */

type Json = Record<string, unknown>;
type Node = {
  id: string;
  type: string;
  props: Json;
  style?: Json;
  states?: Json;
  devices?: Json;
  hiddenOn?: string[];
  classes?: string[];
  htmlId?: string;
  children?: Node[];
};

export type Media = Record<
  "heroRidge" | "fjord" | "canyon" | "valley" | "alpineCamp" | "hiker" | "river",
  { id: string; url: string; width: number; height: number }
>;

const px = (value: number) => ({ value, unit: "px" });
const em = (value: number) => ({ value, unit: "em" });
const pct = (value: number) => ({ value, unit: "%" });
const color = (id: string) => ({ var: id });
const space = (id: string) => ({ var: id, from: "spacing" });
const size = (id: string) => ({ var: id, from: "fontSize" });
const font = (id: string) => ({ var: id, from: "font" });

// Ids carry a per-layout prefix (page-, head-, foot-, popup-) so they read well in the editor.
let scope = "p";
let counter = 0;
const id = (prefix: string) => `${scope}-${prefix}${(++counter).toString(36).padStart(3, "0")}`;
const begin = (layoutScope: string) => {
  scope = layoutScope;
  counter = 0;
  return `${layoutScope}-root`;
};

const el = (type: string, props: Json, extra: Partial<Node> = {}): Node => ({
  id: id(type.replace(/[^a-z]/g, "").slice(0, 6)),
  type,
  props,
  ...extra,
});
const box = (children: Node[], extra: Partial<Node> = {}, props: Json = {}): Node =>
  el("container", props, { ...extra, children });
const row = (children: Node[], extra: Partial<Node> = {}): Node =>
  el("flexbox", {}, { ...extra, children });
const grid = (columns: number, children: Node[], extra: Partial<Node> = {}): Node =>
  el("grid", { columns }, { ...extra, children });
const heading = (text: string, level: number, extra: Partial<Node> = {}) =>
  el("heading", { text, level }, extra);
const text = (value: string, extra: Partial<Node> = {}) => el("text", { text: value }, extra);
const label = (value: string, extra: Partial<Node> = {}) => el("label", { text: value }, extra);
const button = (value: string, href: string | undefined, extra: Partial<Node> = {}) =>
  el("button", href ? { text: value, href } : { text: value }, extra);
const link = (value: string, href: string, extra: Partial<Node> = {}) =>
  el("link", { text: value, href }, extra);

const inner = (children: Node[], extra: Partial<Node> = {}) =>
  box(children, { classes: ["inner"], ...extra });

export const design = {
  schemaVersion: 13,
  variables: {
    colors: [
      { id: "forest", name: "Forest", value: "#16301f" },
      { id: "pine", name: "Pine", value: "#24533a" },
      { id: "moss", name: "Moss", value: "#7d9a6a" },
      { id: "ember", name: "Ember", value: "#c95a24" },
      { id: "ember-dark", name: "Ember dark", value: "#a5461a" },
      { id: "sand", name: "Sand", value: "#f1eadc" },
      { id: "paper", name: "Paper", value: "#fbf8f2" },
      { id: "ink", name: "Ink", value: "#18201b" },
      { id: "stone", name: "Stone", value: "#56605a" },
      { id: "line", name: "Line", value: "#e3dccd" },
      { id: "white", name: "White", value: "#ffffff" },
    ],
    fonts: [
      { id: "display", name: "Display", value: 'Fraunces, "Iowan Old Style", Georgia, serif' },
      { id: "body", name: "Body", value: '"DM Sans", Inter, system-ui, sans-serif' },
    ],
    fontSizes: [
      { id: "display", name: "Display", value: px(76) },
      { id: "h2", name: "Heading 2", value: px(46) },
      { id: "h3", name: "Heading 3", value: px(23) },
      { id: "lead", name: "Lead", value: px(20) },
      { id: "body", name: "Body", value: px(17) },
      { id: "small", name: "Small", value: px(14) },
      { id: "micro", name: "Micro", value: px(12) },
    ],
    spacings: [
      { id: "xs", name: "XS", value: px(8) },
      { id: "sm", name: "Small", value: px(16) },
      { id: "md", name: "Medium", value: px(24) },
      { id: "lg", name: "Large", value: px(40) },
      { id: "xl", name: "XL", value: px(64) },
      { id: "xxl", name: "Section", value: px(120) },
    ],
  },
  classes: [
    {
      id: "section",
      name: "Section",
      style: {
        alignItems: "center",
        paddingTop: space("xxl"),
        paddingBottom: space("xxl"),
        paddingLeft: space("md"),
        paddingRight: space("md"),
      },
      devices: { mobile: { paddingTop: space("xl"), paddingBottom: space("xl") } },
    },
    {
      id: "inner",
      name: "Inner",
      style: { width: pct(100), maxWidth: px(1180), gap: space("lg") },
    },
    {
      id: "eyebrow",
      name: "Eyebrow",
      style: {
        fontFamily: font("body"),
        fontSize: size("micro"),
        fontWeight: 700,
        letterSpacing: px(2),
        textTransform: "uppercase",
        color: color("ember"),
      },
    },
    {
      id: "btn",
      name: "Button",
      style: {
        paddingTop: px(15),
        paddingBottom: px(15),
        paddingLeft: px(26),
        paddingRight: px(26),
        borderRadius: px(999),
        borderWidth: px(1),
        borderStyle: "solid",
        borderColor: color("ember"),
        backgroundColor: color("ember"),
        color: color("white"),
        fontFamily: font("body"),
        fontSize: px(16),
        fontWeight: 600,
        transition: { duration: 200, easing: "ease-out", property: "all" },
      },
      states: {
        hover: { backgroundColor: color("ember-dark"), borderColor: color("ember-dark") },
        focus: { boxShadow: { x: 0, y: 0, blur: 0, spread: 4, color: "#f2c4a6" } },
        active: { opacity: 0.9 },
      },
    },
    {
      id: "btn-ghost",
      name: "Button ghost",
      style: {
        backgroundColor: "#ffffff14",
        borderColor: "#ffffff80",
      },
      states: { hover: { backgroundColor: "#ffffff2e", borderColor: color("white") } },
    },
    {
      id: "card",
      name: "Card",
      style: {
        backgroundColor: color("white"),
        borderRadius: px(20),
        borderWidth: px(1),
        borderStyle: "solid",
        borderColor: color("line"),
        overflow: "hidden",
        boxShadow: { x: 0, y: 1, blur: 2, spread: 0, color: "#18201b0f" },
        transition: { duration: 250, easing: "ease-out", property: "all" },
      },
      states: {
        hover: {
          borderColor: color("moss"),
          boxShadow: { x: 0, y: 22, blur: 44, spread: -18, color: "#16301f59" },
        },
      },
    },
    {
      id: "chip",
      name: "Chip",
      style: {
        paddingTop: px(5),
        paddingBottom: px(5),
        paddingLeft: px(11),
        paddingRight: px(11),
        borderRadius: px(999),
        backgroundColor: color("sand"),
        color: color("pine"),
        fontSize: size("micro"),
        fontWeight: 600,
      },
    },
    {
      id: "lead",
      name: "Lead",
      style: { fontSize: size("lead"), lineHeight: em(1.55), maxWidth: px(640) },
    },
  ],
  defaults: {
    h1: {
      fontFamily: font("display"),
      fontSize: size("display"),
      fontWeight: 500,
      lineHeight: em(1.02),
      color: color("ink"),
    },
    h2: {
      fontFamily: font("display"),
      fontSize: size("h2"),
      fontWeight: 500,
      lineHeight: em(1.08),
      color: color("ink"),
    },
    h3: {
      fontFamily: font("display"),
      fontSize: size("h3"),
      fontWeight: 600,
      lineHeight: em(1.25),
      color: color("ink"),
    },
    p: {
      fontFamily: font("body"),
      fontSize: size("body"),
      lineHeight: em(1.65),
      color: color("stone"),
    },
    a: { color: color("pine"), fontWeight: 600 },
  },
};

const tripCard = (
  media: { url: string; width: number; height: number },
  alt: string,
  region: string,
  meta: string,
  title: string,
  body: string,
  price: string,
) =>
  box(
    [
      el(
        "image",
        { src: media.url, alt, width: media.width, height: media.height },
        { style: { width: pct(100), aspectRatio: "4/3", objectFit: "cover" } },
      ),
      box(
        [
          row([label(region, { classes: ["chip"] }), label(meta, { classes: ["chip"] })], {
            style: { gap: space("xs") },
          }),
          heading(title, 3),
          text(body, { style: { fontSize: px(15) } }),
          row(
            [
              label(price, { style: { fontWeight: 700, color: color("ink") } }),
              link("View trip", "#enquire"),
            ],
            {
              style: {
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: space("xs"),
              },
            },
          ),
        ],
        {
          style: {
            gap: px(12),
            paddingTop: space("md"),
            paddingBottom: px(28),
            paddingLeft: space("md"),
            paddingRight: space("md"),
          },
        },
      ),
    ],
    { classes: ["card"], devices: { mobile: { gridColumnSpan: 3 } } },
  );

const stat = (value: string, caption: string) =>
  box(
    [
      label(value, {
        style: {
          fontFamily: font("display"),
          fontSize: px(44),
          color: color("pine"),
          lineHeight: em(1),
        },
      }),
      text(caption, { style: { fontSize: size("small") } }),
    ],
    { style: { gap: px(6) }, devices: { mobile: { gridColumnSpan: 2 } } },
  );

const perk = (iconId: string, title: string, body: string) =>
  row(
    [
      el(
        "icon",
        { iconId, size: 22, decorative: true },
        {
          style: {
            width: px(48),
            height: px(48),
            borderRadius: px(14),
            backgroundColor: color("white"),
            color: color("ember"),
            fontSize: px(22),
          },
        },
      ),
      box(
        [
          heading(title, 3, { style: { fontSize: px(19) } }),
          text(body, { style: { fontSize: px(15) } }),
        ],
        {
          style: { gap: px(4), flexDirection: "column", width: pct(80) },
        },
      ),
    ],
    { style: { flexWrap: "nowrap", gap: px(18), alignItems: "flex-start" } },
  );

const dayPanel = (labelText: string, title: string, body: string, items: string[]) =>
  el(
    "tab-panel",
    { label: labelText },
    {
      style: { paddingTop: space("lg"), gap: space("sm") },
      children: [
        heading(title, 3),
        text(body, { classes: ["lead"] }),
        el("list", { items }, { style: { color: color("stone"), lineHeight: em(1.9) } }),
      ],
    },
  );

const faq = (summary: string, body: string, open = false) =>
  el("accordion-item", open ? { summary, open } : { summary }, {
    style: { borderColor: color("line"), fontSize: px(19), color: color("ink") },
    children: [text(body, { style: { maxWidth: px(760) } })],
  });

export function homeLayout(media: Media, formId: string) {
  const rootId = begin("page");
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: {},
      style: { backgroundColor: color("paper"), fontFamily: font("body"), gap: px(0) },
      children: [
        box(
          [
            inner(
              [
                label("Small-group hiking · since 2014", {
                  classes: ["eyebrow"],
                  style: { color: "#f3c7a4" },
                }),
                heading("Walk the wild edges of the North.", 1, {
                  style: { color: color("white"), maxWidth: px(860) },
                  devices: { mobile: { fontSize: px(46) } },
                }),
                text(
                  "Guided trips through fjords, alpine valleys and desert canyons, in groups of eight or fewer, led by people who grew up on these trails.",
                  { classes: ["lead"], style: { color: "#ffffffd9" } },
                ),
                row(
                  [
                    button("Find your trip", "#trips", {
                      classes: ["btn"],
                      states: {
                        hover: {
                          backgroundColor: color("ember-dark"),
                          boxShadow: { x: 0, y: 12, blur: 28, spread: -10, color: "#c95a24b3" },
                        },
                      },
                    }),
                    button("Get the route guide", undefined, {
                      classes: ["btn", "btn-ghost"],
                      htmlId: "get-guide",
                    }),
                  ],
                  { style: { gap: px(12), marginTop: space("xs") } },
                ),
              ],
              {
                style: { gap: space("md") },
              },
            ),
          ],
          {
            classes: ["section"],
            style: {
              paddingTop: px(136),
              paddingBottom: px(112),
              backgroundImage: media.heroRidge.url,
              backgroundPosition: "center",
              gradient: {
                type: "linear",
                angle: 180,
                stops: [
                  { color: "#0d1d1300", at: 0 },
                  { color: "#0d1d13", at: 100 },
                ],
              },
              overlay: { color: color("forest"), opacity: 0.38 },
              entrance: { type: "fade", duration: 600 },
            },
            devices: { mobile: { paddingTop: px(88), paddingBottom: px(72) } },
          },
          { tag: "section" },
        ),
        box(
          [
            grid(
              4,
              [
                stat("8", "hikers at most in every group"),
                stat("23", "routes across four regions"),
                stat("1 : 4", "guides to hikers on every trip"),
                stat("4.9", "average rating from 1,200 walkers"),
              ],
              {
                classes: ["inner"],
                style: { gap: space("lg") },
              },
            ),
          ],
          {
            style: {
              alignItems: "center",
              paddingTop: space("xl"),
              paddingBottom: space("xl"),
              paddingLeft: space("md"),
              paddingRight: space("md"),
              backgroundColor: color("white"),
              boxShadow: { x: 0, y: -1, blur: 0, spread: 0, color: color("line") },
            },
          },
        ),
        box(
          [
            inner([
              row(
                [
                  box(
                    [
                      label("Autumn and winter 2026", { classes: ["eyebrow"] }),
                      heading("Trips for every kind of walker", 2, {
                        style: { maxWidth: px(560) },
                      }),
                    ],
                    { style: { gap: space("sm") } },
                  ),
                  text(
                    "Every route is scouted by our guides, graded honestly and capped at eight people. Meals, huts and transfers are included.",
                    { style: { maxWidth: px(400) } },
                  ),
                ],
                {
                  style: {
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    gap: space("md"),
                  },
                },
              ),
              grid(
                3,
                [
                  tripCard(
                    media.fjord,
                    "Granite cliffs dropping into a long blue fjord under a bright sky",
                    "Norway",
                    "7 days · Moderate",
                    "Lofoten and the Western Fjords",
                    "Ridge walks above the fjords, nights in red fishing cabins, and the long blue light of late September.",
                    "From €2,140",
                  ),
                  tripCard(
                    media.canyon,
                    "Red sandstone cliffs glowing at sunset above a desert valley",
                    "Utah",
                    "6 days · Challenging",
                    "Canyon Country",
                    "Slot canyons, slickrock benches and a sunrise on the rim, with a support vehicle at camp every night.",
                    "From €1,890",
                  ),
                  tripCard(
                    media.valley,
                    "Tall pines beside a calm river under granite walls",
                    "California",
                    "5 days · Easy",
                    "High Sierra Valleys",
                    "Granite walls, pine meadows and river camps. A gentle first multi-day trip, with light packs.",
                    "From €1,460",
                  ),
                ],
                { style: { gap: space("md") } },
              ),
            ]),
          ],
          { classes: ["section"], htmlId: "trips" },
          { tag: "section" },
        ),
        box(
          [
            grid(
              2,
              [
                el(
                  "image",
                  {
                    src: media.hiker.url,
                    alt: "A hiker with a large pack looking out over misty mountain ridges",
                    width: media.hiker.width,
                    height: media.hiker.height,
                  },
                  {
                    style: {
                      width: pct(100),
                      aspectRatio: "4/5",
                      objectFit: "cover",
                      borderRadius: px(24),
                    },
                    devices: { mobile: { gridColumnSpan: 2, aspectRatio: "4/3" } },
                  },
                ),
                box(
                  [
                    label("Why Northfold", { classes: ["eyebrow"] }),
                    heading("Guided by locals, paced for real people", 2),
                    text(
                      "We plan the hard parts so you can enjoy the walking: permits, huts, luggage transfers, and a guide who knows which ridge to skip when the weather turns.",
                      { classes: ["lead"] },
                    ),
                    box(
                      [
                        perk(
                          "user",
                          "Small groups, always",
                          "Eight hikers at most, with two guides on every trip over five days.",
                        ),
                        perk(
                          "calendar",
                          "Flexible dates",
                          "Move your trip up to 30 days before departure at no charge.",
                        ),
                        perk(
                          "heart",
                          "Leave it better",
                          "Two percent of every booking funds trail repair in the regions we walk.",
                        ),
                      ],
                      { style: { gap: space("md"), marginTop: space("xs") } },
                    ),
                  ],
                  {
                    style: { gap: space("md"), justifyContent: "center" },
                    devices: { mobile: { gridColumnSpan: 2 } },
                  },
                ),
              ],
              { classes: ["inner"], style: { gap: space("xl"), alignItems: "center" } },
            ),
          ],
          { classes: ["section"], htmlId: "why", style: { backgroundColor: color("sand") } },
          { tag: "section" },
        ),
        box(
          [
            inner([
              box(
                [
                  label("A day on the trail", { classes: ["eyebrow"] }),
                  heading("Unhurried mornings, big views, warm dinners", 2, {
                    style: { maxWidth: px(680) },
                  }),
                ],
                { style: { gap: space("sm") } },
              ),
              el(
                "tabs",
                {},
                {
                  style: { fontSize: px(16), color: color("ink") },
                  children: [
                    dayPanel(
                      "Morning",
                      "Coffee at the hut, packs on by nine",
                      "Breakfast is made fresh by the hut team. Your guide walks you through the route and the weather before the first climb.",
                      [
                        "Hot breakfast and packed lunch",
                        "Route and weather briefing",
                        "Luggage goes ahead by road",
                      ],
                    ),
                    dayPanel(
                      "On the trail",
                      "Five to seven hours of walking",
                      "We stop often for photos, swims and stories. Expect 12 to 18 kilometres a day, with the hardest climbs in the cool of the morning.",
                      [
                        "Two guides, first aid trained",
                        "Snack stops every 90 minutes",
                        "Shorter options on most days",
                      ],
                    ),
                    dayPanel(
                      "Evening",
                      "A shower, a view and a long table",
                      "Nights are in mountain huts, guesthouses and fishing cabins. Dinner is local, seasonal and shared.",
                      [
                        "Private rooms on every trip",
                        "Vegetarian and allergy-friendly menus",
                        "Tomorrow's plan over dessert",
                      ],
                    ),
                  ],
                },
              ),
            ]),
          ],
          { classes: ["section"] },
          { tag: "section" },
        ),
        box(
          [
            grid(
              2,
              [
                box(
                  [
                    label("Plan your trip", { classes: ["eyebrow"], style: { color: "#f3c7a4" } }),
                    heading("Tell us where you want to walk", 2, {
                      style: { color: color("white") },
                    }),
                    text(
                      "A guide reads every message and replies within two working days with dates, a packing list and an honest view of the route.",
                      { classes: ["lead"], style: { color: "#ffffffcc" } },
                    ),
                    el(
                      "list",
                      {
                        items: [
                          "No deposit until your dates are confirmed",
                          "Free date changes up to 30 days out",
                          "Gear rental at every trailhead",
                        ],
                      },
                      { style: { color: "#ffffffd9", lineHeight: em(2), fontSize: px(16) } },
                    ),
                  ],
                  { style: { gap: space("md") }, devices: { mobile: { gridColumnSpan: 2 } } },
                ),
                box(
                  [
                    el(
                      "form",
                      { formId },
                      {
                        style: { gap: px(16), color: color("ink"), fontSize: px(15) },
                        children: [
                          el("text-input", {
                            field: "name",
                            label: "Your name",
                            placeholder: "Alex Morgan",
                          }),
                          el("text-input", {
                            field: "email",
                            label: "Email",
                            placeholder: "alex@example.com",
                          }),
                          el("select", { field: "trip", label: "Which trip?" }),
                          el("textarea", {
                            field: "message",
                            label: "Anything we should know?",
                            placeholder: "Dates, fitness, dietary needs…",
                          }),
                          el("checkbox", { field: "guide", label: "Send me the 2026 route guide" }),
                          el("submit", { label: "Send enquiry" }, { classes: ["btn"] }),
                        ],
                      },
                    ),
                  ],
                  {
                    style: {
                      backgroundColor: color("white"),
                      borderRadius: px(24),
                      paddingTop: space("lg"),
                      paddingBottom: space("lg"),
                      paddingLeft: space("lg"),
                      paddingRight: space("lg"),
                      boxShadow: { x: 0, y: 30, blur: 60, spread: -20, color: "#00000059" },
                    },
                    devices: {
                      mobile: {
                        gridColumnSpan: 2,
                        paddingLeft: space("md"),
                        paddingRight: space("md"),
                      },
                    },
                  },
                ),
              ],
              { classes: ["inner"], style: { gap: space("xl"), alignItems: "center" } },
            ),
          ],
          {
            classes: ["section"],
            htmlId: "enquire",
            style: {
              gradient: {
                type: "linear",
                angle: 135,
                stops: [
                  { color: color("forest"), at: 0 },
                  { color: color("pine"), at: 100 },
                ],
              },
            },
          },
          { tag: "section" },
        ),
        box(
          [
            box(
              [
                box(
                  [label("Questions", { classes: ["eyebrow"] }), heading("Before you lace up", 2)],
                  { style: { gap: space("sm"), alignItems: "center" } },
                ),
                el(
                  "accordion",
                  {},
                  {
                    style: { width: pct(100) },
                    children: [
                      faq(
                        "How fit do I need to be?",
                        "If you can walk five hours with breaks and a light daypack, our Easy and Moderate trips will suit you. Challenging trips add longer climbs and rougher ground. We grade every route honestly.",
                        true,
                      ),
                      faq(
                        "What is included in the price?",
                        "Guides, all nights' accommodation, breakfasts and dinners, packed lunches, luggage transfers and park permits. Flights and travel insurance are not included.",
                      ),
                      faq(
                        "Can I come on my own?",
                        "Yes. About half of our walkers travel solo. Private rooms are standard, so there is no single supplement.",
                      ),
                      faq(
                        "What happens if the weather turns?",
                        "Your guide always has a lower-level alternative planned. Safety comes first, and the views from the valley are often just as good.",
                      ),
                    ],
                  },
                ),
              ],
              {
                style: {
                  width: pct(100),
                  maxWidth: px(820),
                  gap: space("lg"),
                  alignItems: "center",
                },
              },
            ),
          ],
          { classes: ["section"], htmlId: "faq" },
          { tag: "section" },
        ),
      ],
    },
  };
}

export function headerLayout() {
  const rootId = begin("head");
  const nav = (t: string, href: string) =>
    link(t, href, {
      style: {
        color: color("ink"),
        fontWeight: 500,
        fontSize: px(15),
        textDecoration: "none",
      },
      states: { hover: { textDecoration: "underline", color: color("forest") } },
    });
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: { tag: "header" },
      style: {
        paddingTop: px(16),
        paddingBottom: px(16),
        paddingLeft: space("lg"),
        paddingRight: space("lg"),
        backgroundColor: "#fbf8f2f2",
        fontFamily: font("body"),
        position: "sticky",
        top: px(0),
        zIndex: 50,
        boxShadow: { x: 0, y: 1, blur: 0, spread: 0, color: color("line") },
      },
      devices: { mobile: { paddingLeft: space("sm"), paddingRight: space("sm") } },
      children: [
        row(
          [
            label("Northfold", {
              style: {
                fontFamily: font("display"),
                fontSize: px(26),
                fontWeight: 600,
                color: color("forest"),
              },
            }),
            row([nav("Trips", "#trips"), nav("Why us", "#why"), nav("FAQ", "#faq")], {
              style: { gap: px(32), alignItems: "center" },
              hiddenOn: ["mobile"],
            }),
            button("Book a trip", "#enquire", {
              classes: ["btn"],
              style: {
                paddingTop: px(10),
                paddingBottom: px(10),
                paddingLeft: px(20),
                paddingRight: px(20),
                fontSize: px(15),
              },
            }),
          ],
          {
            style: {
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: px(24),
              width: pct(100),
              maxWidth: px(1180),
              marginLeft: "auto",
              marginRight: "auto",
            },
          },
        ),
      ],
    },
  };
}

export function footerLayout() {
  const rootId = begin("foot");
  const col = (title: string, items: string[]) =>
    box(
      [
        label(title, { classes: ["eyebrow"], style: { color: "#f3c7a4" } }),
        ...items.map((t) => text(t, { style: { color: "#ffffffb3", fontSize: px(15) } })),
      ],
      { style: { gap: px(10) }, devices: { mobile: { gridColumnSpan: 2 } } },
    );
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: { tag: "footer" },
      style: {
        alignItems: "center",
        paddingTop: space("xl"),
        paddingBottom: space("lg"),
        paddingLeft: space("md"),
        paddingRight: space("md"),
        backgroundColor: color("forest"),
        fontFamily: font("body"),
        gap: space("lg"),
      },
      children: [
        grid(
          4,
          [
            box(
              [
                label("Northfold", {
                  style: {
                    fontFamily: font("display"),
                    fontSize: px(28),
                    fontWeight: 600,
                    color: color("white"),
                  },
                }),
                text("Small-group hiking trips in Norway, the Alps, Utah and California.", {
                  style: { color: "#ffffffb3", fontSize: px(15), maxWidth: px(280) },
                }),
              ],
              { style: { gap: px(12) }, devices: { mobile: { gridColumnSpan: 4 } } },
            ),
            col("Trips", ["Norway", "The Alps", "Utah", "California"]),
            col("Company", ["Our guides", "Trail fund", "Journal", "Careers"]),
            col("Contact", ["hello@northfold.example", "Mon–Fri, 9–17 CET", "Tromsø, Norway"]),
          ],
          { classes: ["inner"], style: { gap: space("lg") } },
        ),
        el("divider", {}, { style: { width: pct(100), maxWidth: px(1180), color: "#ffffff26" } }),
        text("© 2026 Northfold Expeditions. A demo site built with EmVB.", {
          style: { color: "#ffffff80", fontSize: px(13), width: pct(100), maxWidth: px(1180) },
        }),
      ],
    },
  };
}

export function popupLayout(media: Media) {
  const rootId = begin("popup");
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: {},
      style: { backgroundColor: color("white"), fontFamily: font("body"), gap: space("md") },
      children: [
        el(
          "image",
          {
            src: media.alpineCamp.url,
            alt: "",
            decorative: true,
            width: media.alpineCamp.width,
            height: media.alpineCamp.height,
          },
          {
            style: {
              width: pct(100),
              aspectRatio: "2/1",
              objectFit: "cover",
              borderRadius: px(14),
            },
          },
        ),
        box(
          [
            label("Free download", { classes: ["eyebrow"] }),
            heading("The 2026 route guide", 2, { style: { fontSize: px(34) } }),
            text(
              "Twenty-three routes with maps, gradings, best months and the huts we love. Forty pages, no spam.",
              { style: { fontSize: px(16) } },
            ),
            box([button("Email me the guide", "#enquire", { classes: ["btn"] })], {
              style: { alignItems: "flex-start", marginTop: space("xs") },
            }),
          ],
          { style: { gap: px(12), paddingLeft: px(4), paddingRight: px(4), paddingBottom: px(4) } },
        ),
      ],
    },
  };
}

export function notFoundLayout() {
  const rootId = begin("nf404");
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: {},
      style: {
        alignItems: "center",
        gap: space("md"),
        paddingTop: px(140),
        paddingBottom: px(140),
        paddingLeft: space("md"),
        paddingRight: space("md"),
        backgroundColor: color("paper"),
      },
      children: [
        label("Error 404", { classes: ["eyebrow"] }),
        heading("This trail doesn't go anywhere", 1, {
          style: { textAlign: "center", fontSize: px(56) },
        }),
        text("The page may have moved. Head back to the trailhead and pick another route.", {
          classes: ["lead"],
          style: { textAlign: "center" },
        }),
        button("Back to the trailhead", "/", { classes: ["btn"] }),
      ],
    },
  };
}

export function templateLayout() {
  const rootId = begin("tmpl");
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: {},
      style: {
        gap: space("lg"),
        paddingTop: space("xl"),
        paddingBottom: space("xl"),
        paddingLeft: space("md"),
        paddingRight: space("md"),
        alignItems: "center",
      },
      children: [
        inner([
          label("Region · days · grade", { classes: ["eyebrow"] }),
          heading("Trip name", 1),
          text("One paragraph that sells the trip.", { classes: ["lead"] }),
          button("Enquire about this trip", "#enquire", { classes: ["btn"] }),
        ]),
      ],
    },
  };
}

/** A short content page, so the Pages list shows more than the home page. */
export function simplePageLayout(eyebrow: string, title: string, lead: string) {
  const rootId = begin(`pg${title.length}`);
  return {
    schemaVersion: 13,
    root: {
      id: rootId,
      type: "container",
      props: {},
      style: {
        gap: space("lg"),
        paddingTop: space("xl"),
        paddingBottom: space("xl"),
        paddingLeft: space("md"),
        paddingRight: space("md"),
        alignItems: "center",
      },
      children: [
        inner([
          label(eyebrow, { classes: ["eyebrow"] }),
          heading(title, 1),
          text(lead, { classes: ["lead"] }),
        ]),
      ],
    },
  };
}

export const tripOptions = [
  { label: "Lofoten and the Western Fjords", value: "lofoten" },
  { label: "Canyon Country", value: "canyon-country" },
  { label: "High Sierra Valleys", value: "high-sierra" },
  { label: "Not sure yet", value: "undecided" },
];
