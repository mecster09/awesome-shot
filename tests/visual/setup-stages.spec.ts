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

test.describe("compact landscape tablet", () => {
  test.use({ viewport: { width: 1280, height: 625 } });

  test("keeps the Match Setup primary action reachable when browser chrome reduces height", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Team name").fill("Roses");
    await page.getByRole("button", { name: "Next: Setup Season" }).click();
    await page.getByLabel("Season title").fill("2026 Winter");
    await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
    await page.getByRole("button", { name: "Start Match setup" }).click();
    await page.getByLabel("New opposition name").fill("Thunder");
    await page.getByRole("button", { name: "Add opposition to match" }).click();
    for (const name of ["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia"]) await addPlayer(page, name);
    await page.getByLabel("Match date").fill("2026-10-04");

    const setupForm = page.locator(".prototype-setup-form");
    expect(await setupForm.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    const next = page.getByRole("button", { name: "Next: Setup Quarter" });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport();
    await next.click();

    for (const [position, player] of [["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"], ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"]] as const) {
      await page.getByLabel(position).selectOption({ label: player });
    }
    const startMatch = page.getByRole("button", { name: "Start Match" });
    await startMatch.scrollIntoViewIfNeeded();
    await expect(startMatch).toBeInViewport();
    await startMatch.click();
    await expect(page.getByRole("button", { name: "Record Goals for Faye" })).toBeVisible();
  });
});

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

for (const viewport of [{ width: 1205, height: 729 }, { width: 753, height: 1180 }] as const) {
  test.describe(`live capture geometry at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("keeps the complete capture matrix and its commands inside the safe interaction band", async ({ page }) => {
      await startLiveMatch(page);

      const matrix = page.getByRole("region", { name: "Current court event grid" });
      await expect(matrix).toBeVisible();
      await expect(matrix.locator(".player-stat-card")).toHaveCount(7);
      await expect(matrix.locator(".event-cell")).toHaveCount(56);
      await expect(page.locator(".event-minus-badge")).toHaveCount(0);

      const commandNames = ["Record Substitution", "Undo", "Event Feed", "End Quarter", "More"];
      for (const name of commandNames) {
        await expect(page.getByRole("button", { name })).toBeVisible();
      }

      const eventGeometry = await page.locator(".event-cell").evaluateAll((cells) => cells.map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      const contentGeometry = await matrix.locator(".player-court-identity, .court-matrix-header > div > span").evaluateAll((items) => items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      }));
      const commandGeometry = await Promise.all(commandNames.map(async (name) => page.getByRole("button", { name }).evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      })));
      const allGeometry = [...eventGeometry, ...contentGeometry, ...commandGeometry];
      expect(eventGeometry.every((cell) => cell.width >= 48 && cell.height >= 48)).toBe(true);
      expect(commandGeometry.every((command) => command.width >= 48 && command.height >= 48)).toBe(true);
      expect([...eventGeometry, ...contentGeometry].every((cell) => cell.left >= 0 && cell.right <= viewport.width && cell.top >= 0 && cell.bottom <= viewport.height)).toBe(true);
      expect(commandGeometry.every((command) => command.left >= 0 && command.right <= viewport.width && command.top >= 0 && command.bottom <= viewport.height)).toBe(true);
      expect(eventGeometry.every((cell, index) => eventGeometry.slice(index + 1).every((other) => cell.right <= other.left || other.right <= cell.left || cell.bottom <= other.top || other.bottom <= cell.top))).toBe(true);
      expect(commandGeometry.every((command, index) => commandGeometry.slice(index + 1).every((other) => command.right <= other.left || other.right <= command.left || command.bottom <= other.top || other.bottom <= command.top))).toBe(true);
      expect(allGeometry.every((item) => item.width > 0 && item.height > 0)).toBe(true);
      expect(await matrix.locator(".player-court-identity, .court-matrix-header > div > span").evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth && item.scrollHeight <= item.clientHeight))).toBe(true);
      expect(await matrix.evaluate((element) => element.scrollWidth === element.clientWidth && element.scrollHeight === element.clientHeight)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth && document.documentElement.scrollHeight === window.innerHeight)).toBe(true);
    });
  });
}

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
  await expect(page.getByLabel("Team name")).toBeVisible();
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
