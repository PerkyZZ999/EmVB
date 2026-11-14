import { describe, expect, test } from "bun:test";
import { initMaps } from "./map.ts";

function fixture(src = "https://www.openstreetmap.org/export/embed.html?bbox=1%2C2%2C3%2C4") {
  document.body.innerHTML = `
    <div class="emvb-map" data-emvb-map>
      <p class="emvb-map-address">1 Main St</p>
      <a class="emvb-map-link" href="https://www.openstreetmap.org/">Open in OpenStreetMap</a>
      <div class="emvb-map-frame" data-src="${src}" data-title="Map of 1 Main St" data-height="400">
        <button type="button" class="emvb-map-load">Show the map</button>
        <p class="emvb-map-note">Loads a map from OpenStreetMap.</p>
      </div>
    </div>`;
  return document.querySelector<HTMLElement>("[data-emvb-map]") as HTMLElement;
}

describe("map runtime (W-1041)", () => {
  test("no iframe until the button is pressed; then the named map takes its place", () => {
    const map = fixture();
    initMaps(document);
    expect(map.dataset["emvbReady"]).toBe("");
    expect(document.querySelectorAll("iframe").length).toBe(0);
    document.querySelector<HTMLButtonElement>(".emvb-map-load")?.click();
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=1%2C2%2C3%2C4",
    );
    expect(iframe?.title).toBe("Map of 1 Main St");
    expect(iframe?.getAttribute("height")).toBe("400");
    expect(document.querySelectorAll(".emvb-map-load").length).toBe(0);
  });

  test("a source that isn't a map service is never loaded", () => {
    fixture("https://evil.example/");
    initMaps(document);
    document.querySelector<HTMLButtonElement>(".emvb-map-load")?.click();
    expect(document.querySelectorAll("iframe").length).toBe(0);
  });

  test("running twice wires each map once", () => {
    fixture();
    initMaps(document);
    initMaps(document);
    document.querySelector<HTMLButtonElement>(".emvb-map-load")?.click();
    expect(document.querySelectorAll("iframe").length).toBe(1);
  });
});
