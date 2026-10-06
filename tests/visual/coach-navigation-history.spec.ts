import { expect, test, type Page } from "@playwright/test";

const tabletViewports = [
  { label: "landscape", width: 1205, height: 729 },
  { label: "portrait", width: 753, height: 1180 },
] as const;

const createActiveSeason = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Team name").fill("Roses");
  await page.getByRole("button", { name: "Next: Setup Season" }).click();
  await page.getByLabel("Season title").fill("2026 Winter");
  await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
  await expect(page.getByRole("heading", { name: "No Match in progress" })).toBeVisible();
};

const startLiveMatch = async (page: Page) => {
  await createActiveSeason(page);
  await page.getByRole("button", { name: "Start Match setup" }).click();
  await page.getByLabel("New opposition name").fill("Thunder");
  await page.getByRole("button", { name: "Add opposition to match" }).click();
  for (const name of ["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"]) {
    await page.getByLabel("New player name").fill(name);
    await page.getByRole("button", { name: "Add player to Match Squad" }).click();
  }
  await page.getByLabel("Match date").fill("2026-09-26");
  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) {
    await page.getByLabel(position).selectOption({ label: player });
  }
  await page.getByRole("button", { name: "Start Match" }).click();
};

for (const viewport of tabletViewports) {
  test.describe(`Coach navigation browser Back at ${viewport.label} tablet`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test("unwinds drawer and destinations without changing the address", async ({ page }) => {
      await createActiveSeason(page);
      const address = page.url();
      const menu = page.getByRole("button", { name: "Open coach navigation" });

      await menu.click();
      await expect(page.getByRole("dialog", { name: "Coach navigation" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Close coach navigation" })).toBeFocused();
      await expect(page.locator(".app-content")).toHaveAttribute("inert", "");
      await expect(page.locator(".app-content")).toHaveAttribute("aria-hidden", "true");
      await page.goBack();
      await expect(page.getByRole("dialog", { name: "Coach navigation" })).toBeHidden();
      await expect(page.getByRole("heading", { name: "No Match in progress" })).toBeVisible();
      await expect(menu).toBeFocused();

      await menu.click();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await expect(page).toHaveURL(address);

      await menu.click();
      await page.goBack();
      await expect(page.getByRole("dialog", { name: "Coach navigation" })).toBeHidden();
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole("heading", { name: "No Match in progress" })).toBeVisible();
    });

    test("restores an unsaved next-Quarter Court after navigating Back from History", async ({ page }) => {
      await startLiveMatch(page);
      await page.getByRole("button", { name: "End Quarter" }).click();
      await page.getByRole("button", { name: "Prepare Quarter 2 Court" }).click();
      await page.getByLabel("Goal Keeper").selectOption({ label: "Bea" });

      await page.getByRole("button", { name: "Open coach navigation" }).click();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await page.goBack();

      await expect(page.getByLabel("Goal Keeper").locator("option:checked")).toHaveText("Bea");
    });

    test("keeps Settings contained tasks in the browser Back stack", async ({ page }) => {
      await createActiveSeason(page);
      await page.getByRole("button", { name: "Open coach navigation" }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("button", { name: "Backup & restore" }).click();
      await page.getByLabel("Backup data").fill('{"large":"draft"}');
      await expect(page.locator(".backup-screen .backup-card")).toHaveCSS("overflow-y", "auto");

      await page.goBack();
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole("heading", { name: "No Match in progress" })).toBeVisible();
    });
  });
}
