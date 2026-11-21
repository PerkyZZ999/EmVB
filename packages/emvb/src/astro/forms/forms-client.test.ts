import { describe, expect, test } from "bun:test";

describe("forms runtime import (W-332)", () => {
  test("the default forms entry does not import the forms plugin", async () => {
    const safe = await Bun.file(new URL("./EmVBFormsRuntime.astro", import.meta.url)).text();
    const client = await Bun.file(new URL("./EmVBFormsClient.astro", import.meta.url)).text();
    expect(safe.includes('from "@emdash-cms/plugin-forms')).toBe(false);
    expect(client.includes('from "@emdash-cms/plugin-forms/client"')).toBe(true);
    // W-1065: the inline-message layer runs after the plugin's own script, never on its own.
    expect(client.indexOf("enhanceForms();") > client.indexOf("initForms();")).toBe(true);
    expect(safe.includes("enhance")).toBe(false);
  });
});
