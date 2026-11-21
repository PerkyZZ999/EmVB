import { beforeEach, describe, expect, test } from "bun:test";
import { clearExtensions, rememberExtensionAssets } from "../../core/extensions/index.ts";
import { extensionRuntimeScripts } from "./extension-runtimes.ts";

// W-1086: extension runtimes load once per response, and only those a page asked for.

beforeEach(() => clearExtensions());

describe("extensionRuntimeScripts (W-1086)", () => {
  test("writes asked-for runtimes once per request; css-only and unknown ones add nothing", () => {
    rememberExtensionAssets("emvb-ext-kit", { runtime: "kit()" });
    rememberExtensionAssets("emvb-ext-css", { css: ".a{}" });
    const request = {};
    expect(
      extensionRuntimeScripts(request, [
        "counter",
        "ext:emvb-ext-kit",
        "ext:emvb-ext-css",
        "ext:x",
      ]),
    ).toEqual([{ id: "emvb-ext-kit", code: "kit()" }]);
    // The theme parts' runtimes in the same response: already written.
    expect(extensionRuntimeScripts(request, ["ext:emvb-ext-kit"])).toEqual([]);
    // Another response writes it again.
    expect(extensionRuntimeScripts({}, ["ext:emvb-ext-kit"])).toHaveLength(1);
    expect(extensionRuntimeScripts({}, ["counter"])).toEqual([]);
  });
});
