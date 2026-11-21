import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { unique } from "./support/helpers.ts";

// W-1065: a form in steps with number and date boxes, sent to EmDash Forms as it is.

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

const FORMS = "/_emdash/api/plugins/emdash-forms";

const field = (name: string, type: string, required: boolean, extra = {}) => ({
  id: `f_${name}`,
  type,
  label: name[0]?.toUpperCase() + name.slice(1),
  name,
  required,
  width: "full",
  ...extra,
});

async function createTripForm(request: APIRequestContext, slug: string) {
  const created = await api(request, "POST", `${FORMS}/forms/create`, {
    name: `EmVB ${slug}`,
    slug,
    pages: [
      {
        fields: [
          field("name", "text", true),
          field("email", "email", true),
          field("guests", "number", true, { validation: { min: 1, max: 12 } }),
          field("arrive", "date", true),
          field("budget", "text", false),
        ],
      },
    ],
    settings: {
      confirmationMessage: "Thanks — EmVB received your trip.",
      spamProtection: "none",
      submitLabel: "Book",
      notifyEmails: [],
      digestEnabled: false,
      digestHour: 9,
      retentionDays: 0,
    },
  });
  expect(created.status, JSON.stringify(created.json)).toBe(200);
  const id = (created.json?.["data"] as { id?: string } | undefined)?.id;
  if (!id) throw new Error("forms/create returned no id");
  return id;
}

const input = (id: string, name: string, label: string, extra = {}) => ({
  id,
  type: "text-input",
  props: { field: name, label, ...extra },
});

const tripLayout = (formId: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      {
        id: "form0001",
        type: "form",
        props: { formId, nextLabel: "Continue", prevLabel: "Back" },
        children: [
          {
            id: "step0001",
            type: "form-step",
            props: { title: "About you" },
            children: [input("inpt0001", "name", "Name"), input("inpt0002", "email", "Email")],
          },
          {
            id: "step0002",
            type: "form-step",
            props: { title: "Your trip" },
            children: [
              input("inpt0003", "guests", "Guests"),
              input("inpt0004", "arrive", "Arrive", { minDate: "2026-01-01" }),
              input("inpt0005", "budget", "Budget", { inputType: "number", min: 0, step: 50 }),
            ],
          },
          { id: "subm0001", type: "submit", props: { label: "Book" } },
        ],
      },
    ],
  },
});

async function publishTrip(request: APIRequestContext) {
  const slug = `form-steps-${unique()}`;
  const formId = await createTripForm(request, slug);
  const pageId = await createPage(request, "Form steps", tripLayout(formId), `page-${slug}`);
  await publishPage(request, pageId);
  return { slug, formId };
}

test("a visitor goes through the steps, is stopped at each field to fix, and sends the form", async ({
  page,
  request,
}) => {
  const { slug, formId } = await publishTrip(request);
  await page.goto(`/page-${slug}`);
  const form = page.locator("[data-ec-form][data-ec-initialized]");
  await expect(form).toBeVisible({ timeout: 15_000 });
  const first = page.getByRole("group", { name: "About you" });
  const second = page.getByRole("group", { name: "Your trip" });
  const next = page.getByRole("button", { name: "Continue" });
  const book = page.getByRole("button", { name: "Book" });
  await expect(first).toBeVisible();
  await expect(second).toBeHidden();
  await expect(page.getByRole("button", { name: "Back" })).toBeHidden();
  await expect(book).toBeHidden();
  await expect(page.locator("[data-ec-progress]")).toHaveText("Step 1 of 2");

  // Next with empty required fields: the step stays, the first field is marked and focused.
  await next.click();
  await expect(second).toBeHidden();
  const name = page.getByLabel("Name");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toBeFocused();
  await expect(page.locator("#emvb-field-inpt0001-error")).not.toBeEmpty();
  await name.fill("Ada");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Email").fill(`trip-${slug}@example.com`);

  // A valid step opens the next one and takes focus there, so its title is read out.
  await next.click();
  await expect(second).toBeVisible();
  await expect(first).toBeHidden();
  await expect(second).toBeFocused();
  await expect(page.locator("[data-ec-progress]")).toHaveText("Step 2 of 2");
  await expect(book).toBeVisible();

  const guests = page.getByLabel("Guests");
  await expect(guests).toHaveAttribute("type", "number");
  await expect(guests).toHaveAttribute("min", "1");
  await expect(guests).toHaveAttribute("max", "12");
  const arrive = page.getByLabel("Arrive");
  await expect(arrive).toHaveAttribute("type", "date");
  await expect(arrive).toHaveAttribute("min", "2026-01-01");
  const budget = page.getByLabel("Budget");
  await expect(budget).toHaveAttribute("type", "number");
  await expect(budget).toHaveAttribute("step", "50");

  // Too many guests: Book stops at the field, marks it and focuses it.
  await guests.fill("20");
  await arrive.fill("2026-12-24");
  await book.click();
  await expect(guests).toHaveAttribute("aria-invalid", "true");
  await expect(guests).toBeFocused();
  await guests.fill("3");
  await budget.fill("500");
  await book.click();
  await expect(page.locator("[data-form-status]")).toContainText("EmVB received your trip", {
    timeout: 15_000,
  });

  const listed = await api(request, "POST", `${FORMS}/submissions/list`, { formId, limit: 20 });
  const items =
    (listed.json?.["data"] as { items?: Array<{ data: Record<string, unknown> }> } | undefined)
      ?.items ?? [];
  const mine = items.find((item) => item.data["email"] === `trip-${slug}@example.com`);
  expect(mine?.data).toMatchObject({
    name: "Ada",
    guests: 3,
    arrive: "2026-12-24",
    budget: "500",
  });
});

test("Back returns to the first step with its answers, and focus goes to it", async ({
  page,
  request,
}) => {
  const { slug } = await publishTrip(request);
  await page.goto(`/page-${slug}`);
  await expect(page.locator("[data-ec-form][data-ec-initialized]")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Name").fill("Grace");
  await page.getByLabel("Email").fill(`back-${slug}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  const first = page.getByRole("group", { name: "About you" });
  await expect(first).toBeVisible();
  await expect(first).toBeFocused();
  await expect(page.getByLabel("Name")).toHaveValue("Grace");
});

test("without JavaScript every step shows", async ({ browser, request, baseURL }) => {
  const { slug } = await publishTrip(request);
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto(`/page-${slug}`);
    await expect(page.getByRole("group", { name: "About you" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Your trip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Book" })).toBeVisible();
  } finally {
    await context.close();
  }
});
