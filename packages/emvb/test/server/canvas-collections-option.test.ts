import { afterEach, expect, test } from "bun:test";
import { unlistedCanvasCollectionFirstSeen } from "../../src/core/canvas-collections.ts";
import { emvb } from "../../src/index.ts";
import { createPlugin } from "../../src/server/plugin.ts";

const forget = () => {
  const held = globalThis as unknown as Record<symbol, unknown>;
  delete held[Symbol.for("emvb.canvasCollections")];
  delete held[Symbol.for("emvb.canvasCollectionsWarned")];
};
afterEach(forget);

test("W-1036: emvb({ canvasCollections }) reaches the renderer's warning", () => {
  forget();
  expect(unlistedCanvasCollectionFirstSeen("posts")).toBe(false);
  createPlugin(emvb({ canvasCollections: ["pages"] }).options as Record<string, unknown>);
  expect([
    unlistedCanvasCollectionFirstSeen("pages"),
    unlistedCanvasCollectionFirstSeen("emvb_pages"),
    unlistedCanvasCollectionFirstSeen("posts"),
    unlistedCanvasCollectionFirstSeen("posts"),
  ]).toEqual([false, false, true, false]);
  createPlugin({});
  expect(unlistedCanvasCollectionFirstSeen("pages")).toBe(true);
});
