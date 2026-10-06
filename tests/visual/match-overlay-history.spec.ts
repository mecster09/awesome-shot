import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { label: "landscape", width: 1205, height: 729 },
  { label: "portrait", width: 753, height: 1180 },
] as const;

async function startLiveMatch(page: Page) {
  await page.goto("/");
  await page.getByLabel("Team name").fill("Roses");
  await page.getByRole("button", { name: "Next: Setup Season" }).click();
  await page.getByLabel("Season title").fill("2026 Winter");
  await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
  await page.getByRole("button", { name: "Start Match setup" }).click();
  await page.getByLabel("New opposition name").fill("Thunder");
  await page.getByRole("button", { name: "Add opposition to match" }).click();
  for (const name of ["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"]) {
    await page.getByLabel("New player name").fill(name);
    await page.getByRole("button", { name: "Add player to Match Squad" }).click();
  }
  await page.getByLabel("Match date").fill("2026-09-26");
  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) await page.getByLabel(position).selectOption({ label: player });
  await page.getByRole("button", { name: "Start Match" }).click();
}

for (const viewport of viewports) {
  test.describe(`Match overlay history at ${viewport.label} tablet`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test("Back closes a substitution layer without moving Match Events", async ({ page }) => {
      await startLiveMatch(page);
      const grid = page.getByRole("region", { name: "Current court event grid" });
      await grid.evaluate((element) => { element.scrollTop = 20; });
      await page.getByRole("button", { name: "Record Substitution" }).click();
      await expect(page.getByRole("dialog", { name: "Record Substitution" })).toBeVisible();
      await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
      await page.goBack();
      await expect(page.getByRole("dialog", { name: "Record Substitution" })).toBeHidden();
      await expect(grid).toBeVisible();
      await expect(page.getByRole("button", { name: "Record Substitution" })).toBeFocused();
    });
  });
}

test.describe("Event Feed", () => {
  test.use({ viewport: viewports[0], deviceScaleFactor: 1 });

  test("owns high-volume scrolling and unwinds its nested correction before the feed", async ({ page }) => {
    await startLiveMatch(page);
    const recordGoal = page.getByRole("button", { name: "Record Goals for Faye" });
    for (let index = 0; index < 32; index += 1) await recordGoal.click();

    const grid = page.getByRole("region", { name: "Current court event grid" });
    await grid.evaluate((element) => { element.scrollTop = 18; });
    const gridPosition = await grid.evaluate((element) => element.scrollTop);
    await page.getByRole("button", { name: /Event Feed/ }).click();

    const feed = page.getByRole("dialog", { name: "Event feed" });
    const list = feed.locator(".event-feed-drawer-scroll");
    await expect(list).toEvaluate((element) => element.scrollHeight > element.clientHeight);
    await expect(page.locator("body")).toEvaluate((element) => element.scrollHeight <= window.innerHeight);
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await list.hover();
    await page.mouse.wheel(0, 800);
    await expect(grid).toEvaluate((element, expected) => element.scrollTop === expected, gridPosition);

    await feed.getByRole("button", { name: "Correct event" }).first().click();
    const correction = page.getByRole("dialog", { name: "Correct event" });
    await expect(correction).toBeVisible();
    await expect(correction.getByLabel("Event correction player")).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(correction.getByRole("button", { name: "Cancel correction" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(correction).toBeHidden();
    await expect(feed).toBeVisible();
    await feed.getByRole("button", { name: "Correct event" }).first().click();
    await page.goBack();
    await expect(page.getByRole("dialog", { name: "Correct event" })).toBeHidden();
    await expect(feed).toBeVisible();
    await feed.getByRole("button", { name: "Remove event" }).first().click();
    await expect(page.getByRole("alertdialog", { name: "Delete event?" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("alertdialog", { name: "Delete event?" })).toBeHidden();
    await expect(feed).toBeVisible();
    await feed.getByRole("button", { name: "Remove event" }).first().click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog", { name: "Delete event?" })).toBeHidden();
    await expect(feed).toBeVisible();
    const actionBoxes = await feed.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()));
    expect(actionBoxes.every((box) => box.width >= 48 && box.height >= 48)).toBeTruthy();
    const feedPosition = await list.evaluate((element) => element.scrollTop);
    await page.setViewportSize(viewports[1]);
    await expect(feed).toBeVisible();
    await expect(list).toEvaluate((element, expected) => element.scrollTop === expected, feedPosition);
    await page.setViewportSize(viewports[0]);
    await page.goBack();
    await expect(feed).toBeHidden();
    await expect(grid).toHaveJSProperty("scrollTop", gridPosition);
  });
});
