// W-979: large realistic pages through the core paths the editor and the site use, with sizes.
// `bun scripts/bench-large.ts` prints a table; docs/system/performance.md holds the numbers.
import {
  layoutSearchText,
  renderPage,
  validateLayout,
  type DesignSystem,
  type Layout,
} from "../packages/emvb/src/core/index.ts";

type Node = Layout["root"]["children"][number];

const design: DesignSystem = {
  schemaVersion: 17,
  variables: {
    colors: [
      { id: "brand", name: "Brand", value: "#0055ff" },
      { id: "ink", name: "Ink", value: "#111827" },
    ],
  },
  classes: [
    {
      id: "card",
      name: "Card",
      style: { paddingTop: { value: 24, unit: "px" }, borderRadius: { value: 12, unit: "px" } },
    },
    {
      id: "lead",
      name: "Lead",
      style: { fontSize: { value: 20, unit: "px" } },
      devices: { mobile: { fontSize: { value: 17, unit: "px" } } },
    },
  ],
};

let serial = 0;
const id = (prefix: string) => `${prefix}${String(serial++).padStart(8 - prefix.length, "0")}`;

/** One section of a marketing page: about 25 elements of the usual kinds, styled per device. */
function section(n: number): Node {
  const card = (i: number): Node => ({
    id: id("crd"),
    type: "container",
    props: {},
    classes: ["card"],
    style: { gap: { value: 8, unit: "px" }, backgroundColor: { var: "brand" } },
    states: { hover: { opacity: 0.9 } },
    children: [
      {
        id: id("img"),
        type: "image",
        props: {
          src: `https://img.test/${n}-${i}.jpg`,
          alt: `Photo ${n}.${i}`,
          width: 640,
          height: 480,
        },
      },
      {
        id: id("hd"),
        type: "heading",
        props: { text: `Card ${n}.${i} title`, level: 3 },
        style: { color: { var: "ink" } },
      },
      {
        id: id("tx"),
        type: "text",
        props: { text: `Short words about card ${n}.${i}, long enough to wrap on phones.` },
        classes: ["lead"],
      },
      {
        id: id("bt"),
        type: "button",
        props: { text: "Read more", href: `/cards/${n}-${i}` },
        devices: { mobile: { width: { value: 100, unit: "%" } } },
      },
    ],
  });
  return {
    id: id("sec"),
    type: "layout-section",
    props: {},
    style: { paddingTop: { value: 64, unit: "px" }, paddingBottom: { value: 64, unit: "px" } },
    devices: {
      tablet: { paddingTop: { value: 40, unit: "px" } },
      mobile: { paddingTop: { value: 24, unit: "px" } },
    },
    children: [
      {
        id: id("h2"),
        type: "heading",
        props: { text: `Section ${n}`, level: 2 },
        style: { fontSize: { value: 40, unit: "px" } },
        devices: { mobile: { fontSize: { value: 28, unit: "px" } } },
      },
      { id: id("ls"), type: "list", props: { items: ["Fast", "Accessible", "Yours"] } },
      {
        id: id("grd"),
        type: "grid",
        props: { columns: 3, columnsTablet: 2, columnsMobile: 1 },
        style: { gap: { value: 24, unit: "px" } },
        children: [card(1), card(2), card(3), card(4)],
      },
      {
        id: id("acc"),
        type: "accordion",
        props: {},
        children: [1, 2].map((q) => ({
          id: id("aci"),
          type: "accordion-item",
          props: { summary: `Question ${n}.${q}?` },
          children: [{ id: id("ans"), type: "text", props: { text: `Answer ${n}.${q}.` } }],
        })),
      },
    ],
  } as Node;
}

/** A page of `sections` sections (about 30 elements each). */
export function largeLayout(sections: number): Layout {
  serial = 0;
  return {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: Array.from({ length: sections }, (_, i) => section(i + 1)),
    },
  };
}

export const countNodes = (layout: Layout): number => {
  let count = 0;
  const walk = (node: unknown) => {
    count += 1;
    for (const child of (node as { children?: unknown[] }).children ?? []) walk(child);
  };
  walk(layout.root);
  return count;
};

const median = (run: () => unknown, iterations: number) => {
  run();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.toSorted((a, b) => a - b)[Math.floor(times.length / 2)] ?? Number.NaN;
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

if (import.meta.main) {
  const rows: string[] = [
    "| Elements | validate | render (public) | render (editor) | search text | HTML | CSS | HTML+CSS gzip |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const sections of [7, 33, 66]) {
    const layout = largeLayout(sections);
    const raw = JSON.parse(JSON.stringify(layout)) as unknown;
    const iterations = sections > 50 ? 15 : 40;
    const validate = median(() => validateLayout(raw), iterations);
    const pub = median(() => renderPage(layout, design, { scope: "page" }), iterations);
    const editor = median(
      () => renderPage(layout, design, { mode: "editor", previewDevice: "desktop" }),
      iterations,
    );
    const search = median(() => layoutSearchText(raw), iterations);
    const out = renderPage(layout, design, { scope: "page" });
    const gzip = Bun.gzipSync(new TextEncoder().encode(out.html + out.css)).length;
    rows.push(
      `| ${countNodes(layout)} | ${validate.toFixed(1)} ms | ${pub.toFixed(1)} ms | ${editor.toFixed(1)} ms | ${search.toFixed(2)} ms | ${kb(out.html.length)} | ${kb(out.css.length)} | ${kb(gzip)} |`,
    );
  }
  process.stdout.write(`${rows.join("\n")}\n`);
}
