import { expect, test } from "@playwright/test";

const addPlayer = async (page: import("@playwright/test").Page, name: string) => {
  await page.getByLabel("New player name").fill(name);
  await page.getByRole("button", { name: "Add player to Match Squad" }).click();
  await expect(page.getByRole("button", { name: `Remove ${name} from Match Squad` })).toBeVisible();
};

test("renders persisted Match Squad and Court setup at tablet scale", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Team name").fill("Roses");
  await page.getByRole("button", { name: "Next: Setup Season" }).click();
  await page.getByLabel("Season title").fill("2026 Winter");
  await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
  await page.getByRole("button", { name: "Start Match setup" }).click();

  await page.getByLabel("New opposition name").fill("Thunder");
  await page.getByRole("button", { name: "Add opposition to match" }).click();
  for (const name of ["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"]) await addPlayer(page, name);
  await page.getByLabel("Match date").fill("2026-09-26");

  await expect(page).toHaveScreenshot("match-squad-1180x820.png", { fullPage: true });

  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) await page.getByLabel(position).selectOption({ label: player });

  await expect(page).toHaveScreenshot("quarter-court-1180x820.png", { fullPage: true });

  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();
  await expect(page).toHaveScreenshot("live-match-events-1180x820.png", { fullPage: true });
});
