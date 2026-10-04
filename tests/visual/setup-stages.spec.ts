import { expect, test } from "@playwright/test";

const prototypeViewports = [
  { label: "1180x820", width: 1180, height: 820 },
  { label: "1280x800", width: 1280, height: 800 },
  { label: "1024x768", width: 1024, height: 768 },
  { label: "834", width: 834, height: 1112 },
  { label: "744", width: 744, height: 1133 },
  { label: "390", width: 390, height: 844 },
] as const;

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

for (const viewport of prototypeViewports) {
  test.describe(`prototype parity at ${viewport.label}`, () => {
    test.use({ viewport });
    const capture = (page: import("@playwright/test").Page, name: string) => expect(page).toHaveScreenshot(`${name}-${viewport.label}.png`, { fullPage: true });

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

  await capture(page, "match-squad");

  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) await page.getByLabel(position).selectOption({ label: player });

  await capture(page, "quarter-court");

  await page.getByRole("button", { name: "Start Match" }).click();
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();
  await capture(page, "live-match-events");
});

test("renders setup and Settings production surfaces", async ({ page }) => {
  await page.goto("/");
  await capture(page, "team-setup");

  await page.getByLabel("Team name").fill("Roses");
  await page.getByRole("button", { name: "Next: Setup Season" }).click();
  await capture(page, "season-setup");

  await page.getByLabel("Season title").fill("2026 Winter");
  await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
  await capture(page, "no-match");

  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await capture(page, "settings-root");

  await page.getByRole("button", { name: "Backup & restore" }).click();
  await capture(page, "backup-restore");
  await page.getByRole("button", { name: "Back to Settings" }).click();

  await page.getByRole("button", { name: "Edit team" }).click();
  await capture(page, "settings-team-edit");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Edit season" }).click();
  await capture(page, "settings-season-edit");
});

test("renders every live Match overlay at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();

  await page.getByRole("button", { name: "Event Feed" }).click();
  await capture(page, "event-feed-drawer");
  await page.getByRole("button", { name: "Correct event" }).click();
  await capture(page, "event-correction");
  await page.getByRole("button", { name: "Cancel correction" }).click();
  await page.getByRole("button", { name: "Remove event" }).click();
  await capture(page, "event-delete-confirmation");
  await page.getByRole("button", { name: "Keep event" }).click();
  await page.getByRole("button", { name: "Close Event feed" }).click();

  await page.getByRole("button", { name: "Record Substitution" }).click();
  await capture(page, "substitution-modal");
  await page.getByRole("button", { name: "Close substitution" }).click();

  await page.getByRole("button", { name: "End Quarter" }).click();
  await capture(page, "end-quarter-summary");
  for (const quarter of [2, 3, 4]) {
    await page.getByRole("button", { name: `Prepare Quarter ${quarter} Court` }).click();
    await page.getByRole("button", { name: `Start Quarter ${quarter}` }).click();
    await page.getByRole("button", { name: "End Quarter" }).click();
  }
  await capture(page, "finalise-match-summary");
  await page.getByRole("button", { name: "Confirm final score and finalise Match" }).click();
  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await capture(page, "finalised-match-history");
  await page.getByRole("button", { name: "View Match Events" }).click();
  await capture(page, "finalised-match-events");
});

test("renders abandoned Match History and read-only Match Events at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Record Goals for Faye" }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Abandon match" }).click();
  await page.getByRole("button", { name: "Confirm abandonment" }).click();

  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await capture(page, "abandoned-match-history");

  await page.getByRole("button", { name: "View Match Events" }).click();
  await capture(page, "abandoned-match-events");
});

test("renders the Settings abandonment confirmation at tablet scale", async ({ page }) => {
  await startLiveMatch(page);
  await page.getByRole("button", { name: "Open coach navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Abandon match" }).click();

  await capture(page, "settings-abandon-confirmation");
});
  });
}
