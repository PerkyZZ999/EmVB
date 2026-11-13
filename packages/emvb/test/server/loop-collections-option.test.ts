import { afterEach, expect, test } from "bun:test";
import { loopCollectionAllowed, setLoopCollections } from "../../src/core/loop-collections.ts";
import { emvb } from "../../src/index.ts";
import { createPlugin } from "../../src/server/plugin.ts";

afterEach(() => setLoopCollections(undefined));

test("W-1000: emvb({ loopCollections }) reaches the renderer; bad slugs are dropped", () => {
  const options = emvb({ loopCollections: ["posts", "Bad Slug", "posts", "team"] })
    .options as Record<string, unknown>;
  expect(options["loopCollections"]).toEqual(["posts", "team"]);
  createPlugin(options);
  expect([loopCollectionAllowed("posts"), loopCollectionAllowed("members")]).toEqual([true, false]);
  createPlugin({});
  expect(loopCollectionAllowed("members")).toBe(true);
});
