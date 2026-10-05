import { describe, expect, test } from "bun:test";
import { canvasScale, zoomBox } from "./CanvasFrame.tsx";
import { previewWindowFeatures } from "../useEditorCommands.ts";

describe("canvas scale (W-158, D-046)", () => {
  test("Desktop lays out at 1280 and fits a narrower stage by scaling down", () => {
    expect(canvasScale("desktop", 896, "fit")).toEqual({ width: 1280, scale: 0.7 });
    expect(canvasScale("desktop", 896, "actual")).toEqual({ width: 1280, scale: 1 });
  });

  test("a stage wider than 1280 shows a wider desktop page, never scaled up", () => {
    expect(canvasScale("desktop", 1600, "fit")).toEqual({ width: 1600, scale: 1 });
  });

  test("Tablet and Mobile keep their widths and scale only when the stage is narrower", () => {
    expect(canvasScale("tablet", 896, "fit")).toEqual({ width: 768, scale: 1 });
    expect(canvasScale("tablet", 576, "fit")).toEqual({ width: 768, scale: 0.75 });
    expect(canvasScale("mobile", 896, "fit")).toEqual({ width: 390, scale: 1 });
  });

  test("before the stage is measured the page is unscaled", () => {
    expect(canvasScale("desktop", 0, "fit")).toEqual({ width: 1280, scale: 1 });
  });

  test("page boxes are scaled into overlay pixels", () => {
    expect(zoomBox({ top: 100, left: 40, width: 200, height: 50 }, 0.5)).toEqual({
      top: 50,
      left: 20,
      width: 100,
      height: 25,
    });
  });
});

test("Preview sizes: Desktop a tab, Tablet and Mobile a window of the device width (W-158)", () => {
  expect(previewWindowFeatures("desktop")).toBeUndefined();
  expect(previewWindowFeatures("tablet")).toBe("popup,width=768,height=1024");
  expect(previewWindowFeatures("mobile")).toBe("popup,width=390,height=844");
});
