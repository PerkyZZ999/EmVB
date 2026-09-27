import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext } from "@playwright/test";

const PIXEL = join(process.cwd(), "e2e/fixtures/emvb-pixel.png");

/** Uploads the 1×1 PNG fixture through EmDash media (R-007). */
export async function uploadEmvbPixel(request: APIRequestContext) {
  const buffer = readFileSync(PIXEL);
  const response = await request.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: { name: "emvb-pixel.png", mimeType: "image/png", buffer },
      width: "1",
      height: "1",
      alt: "Hero",
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const json = (await response.json()) as {
    data?: {
      item?: {
        id: string;
        url: string;
        alt: string | null;
        width: number | null;
        height: number | null;
      };
    };
  };
  const item = json.data?.item;
  expect(item?.id).toBeTruthy();
  expect(item?.url).toMatch(/\/_emdash\/api\/media\/file\//);
  if (!item) throw new Error("media upload returned no item");
  return item;
}
