import { describe, expect, test } from "bun:test";
import { BUNDLED_ICON_IDS, sanitizeSvgMarkup } from "../../../core/index.ts";
import { ICON_SVG_MAX } from "../../../core/schema/layout.ts";
import {
  ALL_ICONS,
  ICON_CATEGORIES,
  ICON_SETS,
  filterIcons,
  loadIconSet,
  locateIcon,
  setsFor,
  type IconCategory,
  type LibraryIcon,
} from "./library.ts";

const all: LibraryIcon[] = (await Promise.all(ICON_SETS.map((set) => loadIconSet(set.id)))).flat();
const category = (id: string) => ICON_CATEGORIES.find((item) => item.id === id) as IconCategory;
const ids = (list: LibraryIcon[]) => list.map((icon) => icon.id);

describe("Icon library sets (W-235)", () => {
  test("every set loads with its icons and the styles the sidebar names", async () => {
    const counts: Record<string, number> = {};
    const loadedSets = await Promise.all(ICON_SETS.map((set) => loadIconSet(set.id)));
    for (const [index, set] of ICON_SETS.entries()) {
      const icons = loadedSets[index] ?? [];
      counts[set.id] = icons.length;
      expect(new Set(icons.map((icon) => icon.style))).toEqual(
        new Set(set.styles.map((style) => style.id)),
      );
      expect(icons.every((icon) => icon.setLabel === set.label)).toBe(true);
    }
    expect(counts["lucide"]).toBeGreaterThan(2000);
    expect(counts["fontawesome"]).toBeGreaterThan(2800);
    expect(counts["tabler"]).toBeGreaterThan(6000);
    expect(counts["remix"]).toBeGreaterThan(3000);
  });

  test("a set loads once; later calls share it", async () => {
    expect(loadIconSet("lucide")).toBe(loadIconSet("lucide"));
  });

  test("ids are unique, fit iconId, and every icon passes the SVG allowlist within the stored cap", () => {
    expect(new Set(ids(all)).size).toBe(all.length);
    for (const icon of all) {
      expect(icon.id.length).toBeLessThanOrEqual(64);
      expect(icon.markup.length).toBeLessThanOrEqual(ICON_SVG_MAX);
      const tree = sanitizeSvgMarkup(icon.markup);
      if (!tree) throw new Error(`${icon.id} fails the allowlist`);
      expect(tree.children.length).toBeGreaterThan(0);
    }
  });

  test("stroke sets draw with currentColor strokes, fill sets with currentColor fills", () => {
    const by = (id: string) =>
      all.find((icon) => icon.id === id) ?? ({ markup: "" } as LibraryIcon);
    expect(by("lucide:rocket").markup).toContain('stroke="currentColor"');
    expect(by("tabler:rocket").markup).toContain('stroke="currentColor"');
    expect(by("tabler:rocket").markup).not.toContain("M0 0h24v24H0z");
    expect(by("fa-solid:rocket").markup).toContain('fill="currentColor"');
    expect(by("fa-solid:rocket").markup).toContain('viewBox="0 0 512 512"');
    expect(by("fa-solid:user").markup).toContain('viewBox="0 0 448 512"');
    expect(by("remix:rocket-line").markup).toContain('fill="currentColor"');
    for (const icon of all) expect(icon.markup).not.toContain("class=");
  });

  test("the sidebar lists All icons, each set, and the styles of sets that have several", () => {
    expect(ICON_CATEGORIES.map((item) => item.id)).toEqual([
      ALL_ICONS,
      "lucide",
      "fontawesome",
      "fontawesome/solid",
      "fontawesome/regular",
      "fontawesome/brands",
      "tabler",
      "tabler/outline",
      "tabler/filled",
      "remix",
      "remix/line",
      "remix/fill",
    ]);
    expect(setsFor(category(ALL_ICONS))).toEqual(["lucide", "fontawesome", "tabler", "remix"]);
    expect(setsFor(category("fontawesome/brands"))).toEqual(["fontawesome"]);
  });

  test("search matches every word in any order, tags included, case and accents aside", () => {
    const rockets = ids(filterIcons(all, category(ALL_ICONS), "rocket"));
    for (const id of ["lucide:rocket", "fa-solid:rocket", "tabler:rocket", "remix:rocket-line"])
      expect(rockets).toContain(id);
    expect(ids(filterIcons(all, category("lucide"), "launch"))).toContain("lucide:rocket");
    expect(ids(filterIcons(all, category("lucide"), "RIGHT arrow"))).toContain(
      "lucide:arrow-right",
    );
    expect(ids(filterIcons(all, category("lucide"), "Rócket"))).toContain("lucide:rocket");
    expect(filterIcons(all, category("lucide"), "zzzz-nothing")).toEqual([]);
  });

  test("icons named for the search come before icons only tagged with it (W-236)", async () => {
    const icons = (await Promise.all(ICON_SETS.map((set) => loadIconSet(set.id)))).flat();
    const everything = ICON_CATEGORIES[0];
    if (!everything) throw new Error("no All category");
    const hits = filterIcons(icons, everything, "heart");
    const named = (icon: { label: string; name: string }) =>
      `${icon.label} ${icon.name}`.toLowerCase().includes("heart");
    const firstTagOnly = hits.findIndex((icon) => !named(icon));
    expect(firstTagOnly).toBeGreaterThan(0);
    expect(hits.slice(firstTagOnly).every((icon) => !named(icon))).toBe(true);
    // Exactly "Heart" first, in set order: Lucide before Font Awesome.
    const exact = hits.slice(
      0,
      hits.findIndex((icon) => icon.label.toLowerCase() !== "heart"),
    );
    expect(exact.length).toBeGreaterThanOrEqual(4);
    expect(exact[0]?.id).toBe("lucide:heart");
    expect(exact.map((icon) => icon.set)).toEqual(
      exact
        .map((icon) => icon.set)
        .toSorted(
          (a, b) =>
            ICON_SETS.findIndex((set) => set.id === a) - ICON_SETS.findIndex((set) => set.id === b),
        ),
    );
    // No search: plain set order.
    expect(filterIcons(icons, everything, "")[0]?.set).toBe("lucide");
  });

  test("categories narrow to a set and a style", () => {
    const solid = filterIcons(all, category("fontawesome/solid"), "rocket");
    expect(solid.length).toBeGreaterThan(0);
    expect(solid.every((icon) => icon.id.startsWith("fa-solid:"))).toBe(true);
    const fill = filterIcons(all, category("remix/fill"), "rocket");
    expect(fill.every((icon) => icon.id.endsWith("-fill"))).toBe(true);
    expect(filterIcons(all, category("tabler"), "").every((icon) => icon.set === "tabler")).toBe(
      true,
    );
    expect(filterIcons(all, category(ALL_ICONS), "").length).toBe(all.length);
  });

  test("a stored iconId points back to its set and style; bundled ids are Lucide icons", () => {
    expect(locateIcon("fa-regular:bell")).toEqual({
      set: "fontawesome",
      style: "regular",
      id: "fa-regular:bell",
    });
    expect(locateIcon("tabler-filled:star")).toEqual({
      set: "tabler",
      style: "filled",
      id: "tabler-filled:star",
    });
    expect(locateIcon("remix:rocket-fill")?.style).toBe("fill");
    expect(locateIcon("remix:rocket-line")?.style).toBe("line");
    expect(locateIcon("star")).toEqual({ set: "lucide", style: "lucide", id: "lucide:star" });
    expect(locateIcon("not-bundled")).toBeUndefined();
    expect(locateIcon("other:thing")).toBeUndefined();
    const lucide = new Set(ids(all));
    for (const id of BUNDLED_ICON_IDS) expect(lucide.has(`lucide:${id}`)).toBe(true);
  });
});
