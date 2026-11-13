import { expect, test } from "bun:test";
import { GENERATED, generatedSource, PRESETS } from "./build-social-icons.ts";

// W-1024: the committed brand presets match the icon library's Font Awesome set.
test("W-1024: the Social icons presets are up to date (run bun scripts/build-social-icons.ts)", async () => {
  expect(await Bun.file(GENERATED).text()).toBe(await generatedSource());
});

test("W-1024: the presets cover the usual networks plus email, RSS and a website", () => {
  expect(Object.keys(PRESETS)).toEqual(
    expect.arrayContaining([
      "facebook",
      "instagram",
      "x",
      "linkedin",
      "youtube",
      "email",
      "rss",
      "website",
    ]),
  );
});
