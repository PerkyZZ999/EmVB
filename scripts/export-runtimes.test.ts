import { expect, test } from "bun:test";
import { GENERATED, generatedSource } from "./build-export-runtimes.ts";

test("the export's bundled runtimes match the runtime sources (W-963)", async () => {
  const current = await Bun.file(GENERATED).text();
  expect(current === (await generatedSource())).toBe(true);
}, 30_000);
