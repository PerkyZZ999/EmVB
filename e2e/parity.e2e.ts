import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { api, createPage, getPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

/** Nested 3-deep flex layout (W-023). */
const nestedLayout = {
  schemaVersion: 2,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 8, unit: "px" } },
    children: [
      {
        id: "mid00001",
        type: "container",
        props: {},
        style: { flexDirection: "row", gap: { value: 12, unit: "px" } },
        children: [
          {
            id: "inn00001",
            type: "container",
            props: {},
            style: {
              flexDirection: "column",
              gap: { value: 4, unit: "px" },
              justifyContent: "center",
            },
            children: [{ id: "head0001", type: "heading", props: { text: "Deep", level: 2 } }],
          },
        ],
      },
    ],
  },
};

const readFlex = async (page: Page, selector: string, frame?: FrameLocator) => {
  const loc = frame ? frame.locator(selector) : page.locator(selector);
  return loc.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      direction: style.flexDirection,
      gap: style.columnGap || style.gap,
      justify: style.justifyContent,
    };
  });
};

test("nested 3-deep flex styles match in the canvas and on the published page", async ({
  page,
  request,
}) => {
  const slug = `parity-${unique()}`;
  const id = await createPage(request, "Parity nest", nestedLayout, slug);

  await openEditor(page, id);
  const frame = page.frameLocator("iframe[data-emvb-canvas]");
  await expect(frame.locator(".emvb-heading")).toHaveText("Deep");

  expect(await readFlex(page, ".emvb-root", frame)).toEqual({
    direction: "column",
    gap: "8px",
    justify: "normal",
  });
  expect(await readFlex(page, ".emvb-e-mid00001", frame)).toEqual({
    direction: "row",
    gap: "12px",
    justify: "normal",
  });
  expect(await readFlex(page, ".emvb-e-inn00001", frame)).toEqual({
    direction: "column",
    gap: "4px",
    justify: "center",
  });

  const { rev } = await getPage(request, id);
  expect(
    (await api(request, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, { _rev: rev }))
      .status,
  ).toBe(200);

  await page.goto(`/${slug}`);
  await expect(page.locator(".emvb-heading")).toHaveText("Deep");
  expect(await readFlex(page, ".emvb-root")).toEqual({
    direction: "column",
    gap: "8px",
    justify: "normal",
  });
  expect(await readFlex(page, ".emvb-e-mid00001")).toEqual({
    direction: "row",
    gap: "12px",
    justify: "normal",
  });
  expect(await readFlex(page, ".emvb-e-inn00001")).toEqual({
    direction: "column",
    gap: "4px",
    justify: "center",
  });
});
