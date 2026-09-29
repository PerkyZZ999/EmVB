import { afterEach, expect, test } from "bun:test";
import { dragStash } from "./drag-stash.ts";

afterEach(() => dragStash.clear());

test("stashing an existing element replaces a stashed new type, and the reverse", () => {
  dragStash.new("heading");
  dragStash.existing("head0001");
  expect([dragStash.id(), dragStash.type()]).toEqual(["head0001", null]);
  dragStash.new("image");
  expect([dragStash.id(), dragStash.type()]).toEqual([null, "image"]);
});

test("active is true while either is stashed and false after clear", () => {
  expect(dragStash.active()).toBe(false);
  dragStash.existing("box00001");
  expect(dragStash.active()).toBe(true);
  dragStash.clear();
  expect(dragStash.active()).toBe(false);
  dragStash.new("text");
  expect(dragStash.active()).toBe(true);
});
