import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, overlay, unique } from "./support/helpers.ts";

// W-1027: Schedule publish from the editor; EmDash publishes the saved draft at that time.

setUpEmvbOnce();

type Stored = { item: { status: string; scheduledAt: string | null } };
const stored = async (request: APIRequestContext, id: string) => {
  const { json } = await api(request, "GET", `/_emdash/api/content/emvb_pages/${id}`);
  const data = json?.["data"] as Stored | undefined;
  if (!data) throw new Error(`no page ${id}`);
  return data.item;
};
const pad = (n: number) => String(n).padStart(2, "0");

test("a page is scheduled from the editor, the top bar says when, and the schedule can be cancelled (W-1027)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Launch",
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: "Launch day", level: 1 } }],
      },
    },
    `schedule-${unique()}`,
  );
  await openEditor(page, id, "Launch day");
  await overlay(page).getByRole("button", { name: "Schedule publish" }).click();
  const dialog = page.locator('[data-emvb-dialog="schedule"]');
  await expect(dialog).toBeVisible();
  const when = new Date(Date.now() + 3 * 24 * 3_600_000);
  when.setHours(10, 30, 0, 0);
  const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T10:30`;
  await dialog.getByLabel("Publish on").fill(local);
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click();
  // The first request to a route compiles it in the dev servers, which can take a while.
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(overlay(page).locator("[data-emvb-scheduled]")).toContainText("Publishes");
  const scheduled = await stored(request, id);
  expect(scheduled.status).toBe("scheduled");
  expect(new Date(scheduled.scheduledAt ?? "").getTime()).toBe(when.getTime());

  await overlay(page).getByRole("button", { name: "Change scheduled publishing" }).click();
  await expect(dialog.getByLabel("Publish on")).toHaveValue(local);
  await dialog.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(overlay(page).locator("[data-emvb-scheduled]")).toHaveCount(0);
  const cancelled = await stored(request, id);
  expect([cancelled.status, cancelled.scheduledAt]).toEqual(["draft", null]);
});
