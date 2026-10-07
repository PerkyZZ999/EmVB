/**
 * Builds the Icon library sets (W-234) from the icon packages pinned in the root devDependencies:
 * `bun scripts/build-icon-sets.ts`. Each icon goes through EmVB's own SVG sanitizer; what can't pass
 * is left out and counted. Output: one JSON file per set in packages/emvb/src/admin/editor/icons/sets,
 * loaded lazily by the editor only (public pages get the chosen icon as inline SVG).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { sanitizeSvgMarkup } from "../packages/emvb/src/core/sanitize/svg.ts";
import type { VNode } from "../packages/emvb/src/core/render/vnode.ts";
import type { IconSetFile } from "../packages/emvb/src/admin/editor/icons/set-format.ts";

const root = dirname(dirname(new URL(import.meta.url).pathname));
const pkg = (name: string) => join(root, "node_modules", name);
const version = (name: string) =>
  (JSON.parse(readFileSync(join(pkg(name), "package.json"), "utf8")) as { version: string })
    .version;
const OUT = join(root, "packages/emvb/src/admin/editor/icons/sets");

/**
 * Each set's license file must still be the one EmVB ships under (THIRD_PARTY_NOTICES.md).
 * Remix Icon 4.9+ moved to the custom "Remix Icon License v1.0" (no competing icon libraries), so
 * remixicon stays on 4.8.0, the last Apache-2.0 release; review the license before upgrading.
 */
const LICENSES: [string, string, RegExp][] = [
  ["lucide-static", "LICENSE", /^ISC License/],
  ["@tabler/icons", "LICENSE", /^MIT License/],
  ["remixicon", "License", /^\s*Apache License\s+Version 2\.0/],
  ["@fortawesome/fontawesome-free", "LICENSE.txt", /# Icons: CC BY 4\.0 License/],
];
for (const [name, file, expected] of LICENSES) {
  const text = readFileSync(join(pkg(name), file), "utf8");
  if (!expected.test(text))
    throw new Error(`${name} ${version(name)}: license changed, review it first`);
}
const MAX_TAGS = 8;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};
const FILL = { fill: "currentColor" };

const words = (name: string) => name.replace(/[-_]+/g, " ").trim();
const labelOf = (name: string) => {
  const w = words(name);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const esc = (v: string) =>
  v.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/**
 * Remix paths carry 4–5 decimals on a 24-unit grid. Rounded to 2 (under 0.1px even at 512px) when a
 * path uses absolute commands only, so no error can add up; saves about a fifth of the set.
 */
function round2(d: string): string {
  if (/[a-y]/.test(d)) return d;
  return d.replace(/-?\d*\.\d+/g, (n) => {
    const r = Number(Number(n).toFixed(2)).toString();
    return r === "-0" ? "0" : r;
  });
}

/** Compact markup of the inner elements: `<path d=".."/>`, attributes in source order. */
function body(
  nodes: (VNode | string)[],
  drop: (n: VNode) => boolean,
  strip: string[],
  round = false,
): string {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string" || drop(n)) continue;
    const attrs = Object.entries(n.attrs)
      .filter(([k]) => !strip.includes(k))
      .map(([k, v]) => ` ${k}="${esc(round && k === "d" ? round2(v) : v)}"`)
      .join("");
    const kids = body(n.children, drop, strip, round);
    out += kids ? `<${n.tag}${attrs}>${kids}</${n.tag}>` : `<${n.tag}${attrs}/>`;
  }
  return out;
}

const TABLER_BOX = (n: VNode) => n.tag === "path" && n.attrs.d === "M0 0h24v24H0z";
const skipped: string[] = [];

function parse(file: string, id: string): VNode | undefined {
  const tree = sanitizeSvgMarkup(readFileSync(file, "utf8"));
  if (!tree) skipped.push(id);
  return tree;
}

type Entry = IconSetFile["icons"][number];

function lucide(): IconSetFile {
  const dir = join(pkg("lucide-static"), "icons");
  const tags = JSON.parse(readFileSync(join(pkg("lucide-static"), "tags.json"), "utf8")) as Record<
    string,
    string[]
  >;
  const icons: Entry[] = [];
  for (const f of readdirSync(dir)
    .filter((file) => file.endsWith(".svg"))
    .toSorted()) {
    const name = basename(f, ".svg");
    const tree = parse(join(dir, f), `lucide:${name}`);
    if (!tree) continue;
    icons.push([
      name,
      0,
      labelOf(name),
      body(tree.children, () => false, []),
      (tags[name] ?? []).slice(0, MAX_TAGS).join(" "),
    ]);
  }
  return {
    id: "lucide",
    label: "Lucide",
    version: version("lucide-static"),
    license: "ISC",
    styles: [
      { id: "lucide", label: "Lucide", prefix: "lucide", viewBox: "0 0 24 24", attrs: STROKE },
    ],
    icons,
  };
}

function fontAwesome(): IconSetFile {
  const base = pkg("@fortawesome/fontawesome-free");
  const meta = JSON.parse(
    readFileSync(join(base, "metadata/icon-families.json"), "utf8"),
  ) as Record<string, { label?: string; search?: { terms?: string[] } }>;
  const styles = ["solid", "regular", "brands"] as const;
  const icons: Entry[] = [];
  styles.forEach((style, index) => {
    const dir = join(base, "svgs", style);
    for (const f of readdirSync(dir)
      .filter((file) => file.endsWith(".svg"))
      .toSorted()) {
      const name = basename(f, ".svg");
      const tree = parse(join(dir, f), `fa-${style}:${name}`);
      if (!tree) continue;
      const m = meta[name];
      const entry: Entry = [
        name,
        index,
        m?.label ?? labelOf(name),
        body(tree.children, () => false, ["fill"]),
        (m?.search?.terms ?? []).slice(0, MAX_TAGS).join(" "),
      ];
      if (tree.attrs.viewBox && tree.attrs.viewBox !== "0 0 512 512")
        entry.push(tree.attrs.viewBox);
      icons.push(entry);
    }
  });
  return {
    id: "fontawesome",
    label: "Font Awesome",
    version: version("@fortawesome/fontawesome-free"),
    license: "CC BY 4.0",
    styles: [
      { id: "solid", label: "Solid", prefix: "fa-solid", viewBox: "0 0 512 512", attrs: FILL },
      {
        id: "regular",
        label: "Regular",
        prefix: "fa-regular",
        viewBox: "0 0 512 512",
        attrs: FILL,
      },
      { id: "brands", label: "Brands", prefix: "fa-brands", viewBox: "0 0 512 512", attrs: FILL },
    ],
    icons,
  };
}

function tabler(): IconSetFile {
  const base = pkg("@tabler/icons");
  const meta = JSON.parse(readFileSync(join(base, "icons.json"), "utf8")) as Record<
    string,
    { tags?: (string | number)[]; category?: string }
  >;
  const icons: Entry[] = [];
  (["outline", "filled"] as const).forEach((style, index) => {
    const dir = join(base, "icons", style);
    for (const f of readdirSync(dir)
      .filter((file) => file.endsWith(".svg"))
      .toSorted()) {
      const name = basename(f, ".svg");
      const tree = parse(join(dir, f), `tabler-${style}:${name}`);
      if (!tree) continue;
      const m = meta[name];
      const tags = [...(m?.tags ?? []).map(String), m?.category ?? ""].filter(Boolean);
      icons.push([
        name,
        index,
        labelOf(name),
        body(tree.children, TABLER_BOX, []),
        tags.slice(0, MAX_TAGS).join(" "),
      ]);
    }
  });
  return {
    id: "tabler",
    label: "Tabler",
    version: version("@tabler/icons"),
    license: "MIT",
    styles: [
      { id: "outline", label: "Outline", prefix: "tabler", viewBox: "0 0 24 24", attrs: STROKE },
      { id: "filled", label: "Filled", prefix: "tabler-filled", viewBox: "0 0 24 24", attrs: FILL },
    ],
    icons,
  };
}

function remix(): IconSetFile {
  const base = join(pkg("remixicon"), "icons");
  const icons: Entry[] = [];
  for (const category of readdirSync(base).toSorted()) {
    for (const f of readdirSync(join(base, category))
      .filter((file) => file.endsWith(".svg"))
      .toSorted()) {
      const name = basename(f, ".svg");
      const tree = parse(join(base, category, f), `remix:${name}`);
      if (!tree) continue;
      const style = name.endsWith("-fill") ? 1 : 0;
      const plain = name.replace(/-(line|fill)$/, "");
      icons.push([
        name,
        style,
        labelOf(plain),
        body(tree.children, () => false, [], true),
        category.toLowerCase().replace(/&/g, " "),
      ]);
    }
  }
  return {
    id: "remix",
    label: "Remix",
    version: version("remixicon"),
    license: "Apache-2.0",
    styles: [
      { id: "line", label: "Line", prefix: "remix", viewBox: "0 0 24 24", attrs: FILL },
      { id: "fill", label: "Fill", prefix: "remix", viewBox: "0 0 24 24", attrs: FILL },
    ],
    icons: icons.toSorted((a, b) => (a[0] < b[0] ? -1 : 1)),
  };
}

for (const set of [lucide(), fontAwesome(), tabler(), remix()]) {
  const text = JSON.stringify(set);
  writeFileSync(join(OUT, `${set.id}.json`), text + "\n");
  process.stdout.write(
    `${set.id}: ${set.icons.length} icons, ${(text.length / 1024).toFixed(0)} KB\n`,
  );
}
process.stdout.write(
  `left out (failed the sanitizer): ${skipped.length}${skipped.length ? ` ${skipped.slice(0, 20).join(", ")}` : ""}\n`,
);
