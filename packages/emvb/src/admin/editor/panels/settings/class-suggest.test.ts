import { describe, expect, test } from "bun:test";
import { appliedByName, classOptions } from "./class-suggest.ts";

const catalog = [
  { id: "hero-title", name: "Hero title", style: {} },
  { id: "card", name: "Card", style: {} },
  { id: "card-large", name: "Large card", style: {} },
  { id: "soft-muted", name: "Soft muted", style: {} },
  { id: "muted", name: "Muted", style: {} },
];

const labels = (options: ReturnType<typeof classOptions>) =>
  options.map((o) => (o.kind === "class" ? o.cls.id : `create:${o.name}`));

describe("classOptions (W-087)", () => {
  test("with no query, lists every class not yet applied, in site order", () => {
    expect(labels(classOptions(catalog, ["muted"], ""))).toEqual([
      "hero-title",
      "card",
      "card-large",
      "soft-muted",
    ]);
  });

  test("filters by name or id, case-insensitively, exact then prefix matches first", () => {
    expect(labels(classOptions(catalog, [], "CARD"))).toEqual(["card", "card-large"]);
    expect(labels(classOptions(catalog, [], "ard"))).toEqual(["card", "card-large", "create:ard"]);
    expect(labels(classOptions(catalog, [], "large"))).toEqual(["card-large", "create:large"]);
    expect(labels(classOptions(catalog, [], "hero-t"))).toEqual(["hero-title", "create:hero-t"]);
  });

  test("offers Create last only when no class has that exact name", () => {
    expect(labels(classOptions(catalog, [], "  Button  "))).toEqual(["create:Button"]);
    expect(labels(classOptions(catalog, [], "muted"))).toEqual(["muted", "soft-muted"]);
    expect(labels(classOptions(catalog, ["muted", "soft-muted"], "Muted"))).toEqual([]);
  });

  test("appliedByName finds an applied class by exact name only", () => {
    expect(appliedByName(catalog, ["muted"], " muted ")?.id).toBe("muted");
    expect(appliedByName(catalog, [], "muted")).toBeUndefined();
    expect(appliedByName(catalog, ["muted"], "mut")).toBeUndefined();
  });
});

test("the Create class name is cut to 60 characters (W-220)", () => {
  const option = classOptions([], [], "L".repeat(80)).at(-1);
  expect(option).toEqual({ kind: "create", name: "L".repeat(60) });
});
