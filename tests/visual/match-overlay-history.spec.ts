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
