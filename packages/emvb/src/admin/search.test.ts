import { expect, test } from "bun:test";
import { matchesSearch } from "./search.ts";

test("W-774: list search folds ß to ss both ways, as the command palette does", () => {
  expect(matchesSearch("strasse", "Hauptstraße")).toBe(true);
  expect(matchesSearch("STRASSE", "Hauptstraße")).toBe(true);
  expect(matchesSearch("straße", "Hauptstrasse")).toBe(true);
  expect(matchesSearch("cafe", "Café")).toBe(true);
});
