import { describe, expect, test } from "bun:test";
import { addClassId, moveClassId, removeClassId } from "./classes.ts";

describe("class id list helpers (W-031)", () => {
  test("add, remove, and reorder persist order", () => {
    let ids = addClassId([], "card");
    ids = addClassId(ids, "accent");
    expect(ids).toEqual(["card", "accent"]);
    expect(addClassId(ids, "card")).toEqual(["card", "accent"]);
    expect(moveClassId(ids, 1, -1)).toEqual(["accent", "card"]);
    expect(moveClassId(ids, 0, -1)).toEqual(["card", "accent"]);
    expect(removeClassId(ids, "card")).toEqual(["accent"]);
  });
});
