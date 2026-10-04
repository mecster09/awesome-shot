import { expect, test } from "@playwright/test";

const addPlayer = async (page: import("@playwright/test").Page, name: string) => {
  await page.getByLabel("New player name").fill(name);
  await page.getByRole("button", { name: "Add player to Match Squad" }).click();
  await expect(page.getByRole("button", { name: `Remove ${name} from Match Squad` })).toBeVisible();
};

const startLiveMatch = async (page: import("@playwright/test").Page) => {
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
  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) await page.getByLabel(position).selectOption({ label: player });
  await page.getByRole("button", { name: "Start Match" }).click();
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

test("renders every live Match overlay at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();

  await page.getByRole("button", { name: "Event Feed" }).click();
  await expect(page).toHaveScreenshot("event-feed-drawer-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "Correct event" }).click();
  await expect(page).toHaveScreenshot("event-correction-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "Cancel correction" }).click();
  await page.getByRole("button", { name: "Remove event" }).click();
  await expect(page).toHaveScreenshot("event-delete-confirmation-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "Keep event" }).click();
  await page.getByRole("button", { name: "Close Event feed" }).click();

  await page.getByRole("button", { name: "Record Substitution" }).click();
  await expect(page).toHaveScreenshot("substitution-modal-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "Close substitution" }).click();

  await page.getByRole("button", { name: "End Quarter" }).click();
  await expect(page).toHaveScreenshot("end-quarter-summary-1180x820.png", { fullPage: true });
  for (const quarter of [2, 3, 4]) {
    await page.getByRole("button", { name: `Prepare Quarter ${quarter} Court` }).click();
    await page.getByRole("button", { name: `Start Quarter ${quarter}` }).click();
    await page.getByRole("button", { name: "End Quarter" }).click();
  }
  await expect(page).toHaveScreenshot("finalise-match-summary-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "Confirm final score and finalise Match" }).click();
  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page).toHaveScreenshot("finalised-match-history-1180x820.png", { fullPage: true });
  await page.getByRole("button", { name: "View Match Events" }).click();
  await expect(page).toHaveScreenshot("finalised-match-events-1180x820.png", { fullPage: true });
});

test("renders abandoned Match History and read-only Match Events at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Abandon match" }).click();
  await page.getByRole("button", { name: "Confirm abandonment" }).click();

  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page).toHaveScreenshot("abandoned-match-history-1180x820.png", { fullPage: true });

  await page.getByRole("button", { name: "View Match Events" }).click();
  await expect(page).toHaveScreenshot("abandoned-match-events-1180x820.png", { fullPage: true });
});

test("renders the Settings abandonment confirmation at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Abandon match" }).click();

  await expect(page).toHaveScreenshot("settings-abandon-confirmation-1180x820.png", { fullPage: true });
});
