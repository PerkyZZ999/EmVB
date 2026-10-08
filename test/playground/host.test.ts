import { describe, expect, test } from "bun:test";
import {
  playgroundHost,
  SITE_HOME,
  smallScreenStep,
  TOO_NARROW,
} from "../../site/src/playground/host.ts";

describe("the playground's editor host", () => {
  test("turns off links to EmDash admin screens, which emvb.dev doesn't have (W-289)", () => {
    expect(playgroundHost.adminLinks).toBe(false);
  });

  test("Exit and the way back go to the site's home page", () => {
    expect(SITE_HOME).toBe("/");
    expect(playgroundHost.back.label).toBe("emvb.dev");
  });
});

describe("narrow windows (W-291)", () => {
  test("wide enough opens the editor; narrow asks first", () => {
    expect(smallScreenStep(false, false)).toBe("editor");
    expect(smallScreenStep(false, true)).toBe("editor");
    expect(smallScreenStep(true, false)).toBe("ask");
  });

  test("still narrow after Continue anyway explains how to make room, not a dead end", () => {
    expect(smallScreenStep(true, true)).toBe("too-narrow");
  });

  test("the too-narrow notice says what the editor needs and how to make room", () => {
    expect(TOO_NARROW).toContain("narrower than 1024 px");
    expect(TOO_NARROW).toMatch(/wider|zoom/);
  });
});
