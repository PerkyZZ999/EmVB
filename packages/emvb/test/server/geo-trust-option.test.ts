import { afterEach, expect, test } from "bun:test";
import { geoTrust, setGeoTrust } from "../../src/core/geo-trust.ts";
import { emvb } from "../../src/index.ts";
import { createPlugin } from "../../src/server/plugin.ts";

afterEach(() => setGeoTrust(undefined));

test("W-999: emvb({ trustGeoHeaders }) reaches the renderer through the plugin", () => {
  const options = emvb({ trustGeoHeaders: true }).options as Record<string, unknown>;
  expect(options["trustGeoHeaders"]).toBe(true);
  createPlugin(options);
  expect(geoTrust()).toBe(true);
  createPlugin({});
  expect(geoTrust()).toBeUndefined();
});
