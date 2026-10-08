import { describe, expect, test } from "bun:test";
import { playgroundHost, SITE_HOME } from "../../site/src/playground/host.ts";

describe("the playground's editor host", () => {
  test("turns off links to EmDash admin screens, which emvb.dev doesn't have (W-289)", () => {
    expect(playgroundHost.adminLinks).toBe(false);
  });

  test("Exit and the way back go to the site's home page", () => {
    expect(SITE_HOME).toBe("/");
    expect(playgroundHost.back.label).toBe("emvb.dev");
  });
});
