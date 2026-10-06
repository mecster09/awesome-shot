import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const productionViewports = [
  { label: "landscape", width: 1205, height: 729 },
  { label: "portrait", width: 753, height: 1180 },
] as const;

const court = [
  ["Goal Keeper", "Ava"], ["Goal Defence", "Bea"], ["Wing Defence", "Cora"], ["Centre", "Demi"],
  ["Wing Attack", "Eve"], ["Goal Attack", "Faye"], ["Goal Shooter", "Gia"],
] as const;

async function expectFocusedStage(page: Page, action?: Locator) {
  if (action) await expect(action).toBeInViewport();
  const geometry = await page.evaluate(() => ({
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));
  expect(geometry.documentWidth - geometry.viewportWidth).toBeLessThanOrEqual(1);
  expect(geometry.documentHeight - geometry.viewportHeight).toBeLessThanOrEqual(1);
  const actions = await page.locator("button").evaluateAll((buttons) => buttons.flatMap((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display === "none" || style.visibility === "hidden" || !rect.width || !rect.height
      ? []
      : [{ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }];
  }));
  for (const action of actions) {
    expect.soft(action.width, "custom action width").toBeGreaterThanOrEqual(48);
    expect.soft(action.height, "custom action height").toBeGreaterThanOrEqual(48);
    expect.soft(action.left).toBeGreaterThanOrEqual(0);
    expect.soft(action.top).toBeGreaterThanOrEqual(0);
    expect.soft(action.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect.soft(action.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  }
  for (let index = 0; index < actions.length; index += 1) {
    for (const other of actions.slice(index + 1)) {
      expect.soft(actions[index].right <= other.left || other.right <= actions[index].left || actions[index].bottom <= other.top || other.bottom <= actions[index].top, "custom action hit areas overlap").toBe(true);
    }
  }
  await page.evaluate(() => window.scrollTo(100, 100));
  await expect.poll(() => page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
}

async function captureViewport(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
}

async function createLiveMatch(page: Page, testInfo: TestInfo) {
  await page.goto("/");
  await page.getByLabel("Team name").fill("Roses");
  await page.getByRole("button", { name: "Next: Setup Season" }).click();
  await expectFocusedStage(page, page.getByRole("button", { name: "Next: Setup Match & Squad" }));
  await captureViewport(page, testInfo, "season-setup");
  await page.getByLabel("Season title").fill("2026 Winter");
  await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
  await expectFocusedStage(page, page.getByRole("button", { name: "Start Match setup" }));
  await captureViewport(page, testInfo, "no-match");
  await page.getByRole("button", { name: "Start Match setup" }).click();
  await page.getByLabel("New opposition name").fill("Thunder");
  await page.getByRole("button", { name: "Add opposition to match" }).click();
  for (const name of ["Ava", "Bea", "Cora", "Demi", "Eve", "Faye", "Gia", "Hana", "Ivy", "Jade", "Kira", "Lola"]) {
    await page.getByLabel("New player name").fill(name);
    await page.getByRole("button", { name: "Add player to Match Squad" }).click();
  }
  await page.getByLabel("Match date").fill("2026-10-06");
  await expectFocusedStage(page, page.getByRole("button", { name: "Next: Setup Quarter" }));
  await captureViewport(page, testInfo, "match-and-squad-setup");
  await page.getByRole("button", { name: "Next: Setup Quarter" }).click();
  for (const [position, player] of court) await page.getByLabel(position).selectOption({ label: player });
  await expectFocusedStage(page, page.getByRole("button", { name: "Start Match" }));
  await captureViewport(page, testInfo, "starting-court");
  await page.getByRole("button", { name: "Start Match" }).click();
}

for (const viewport of productionViewports) {
  test.describe(`complete native-tablet coach journey at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test("keeps the IndexedDB-backed coach journey viewport-contained", async ({ page }, testInfo) => {
      await page.goto("/");
      await expectFocusedStage(page, page.getByRole("button", { name: "Next: Setup Season" }));
      await captureViewport(page, testInfo, "team-setup");

      await createLiveMatch(page, testInfo);
      const grid = page.getByRole("region", { name: "Current court event grid" });
      await expect(grid.locator(".player-stat-card")).toHaveCount(7);
      await expect(grid.locator(".event-cell")).toHaveCount(56);
      await expect(grid).toEvaluate((element) => element.scrollHeight === element.clientHeight && element.scrollWidth === element.clientWidth);
      await expectFocusedStage(page, page.getByRole("button", { name: "End Quarter" }));
      await captureViewport(page, testInfo, "live-match-events");

      const goal = page.getByRole("button", { name: "Record Goals for Faye" });
      for (let index = 0; index < 24; index += 1) await goal.click();
      await page.getByRole("button", { name: /Event Feed/ }).click();
      const feed = page.getByRole("dialog", { name: "Event feed" });
      const feedScroll = feed.locator(".event-feed-drawer-scroll");
      await expect(feedScroll).toEvaluate((element) => element.scrollHeight > element.clientHeight);
      await feed.getByRole("button", { name: "Correct event" }).first().click();
      await expect(page.getByRole("dialog", { name: "Correct event" })).toBeVisible();
      await captureViewport(page, testInfo, "event-correction");
      await page.goBack();
      await expect(page.getByRole("dialog", { name: "Correct event" })).toBeHidden();
      await feed.getByRole("button", { name: "Remove event" }).first().click();
      await expect(page.getByRole("alertdialog", { name: "Delete event?" })).toBeVisible();
      await captureViewport(page, testInfo, "event-delete-confirmation");
      await page.goBack();
      await expect(page.getByRole("alertdialog", { name: "Delete event?" })).toBeHidden();
      await expectFocusedStage(page);
      await captureViewport(page, testInfo, "event-feed");
      await feed.getByRole("button", { name: "Close Event feed" }).click();

      await page.getByRole("button", { name: "Record Substitution" }).click();
      await expect(page.getByRole("dialog", { name: "Record Substitution" })).toBeVisible();
      await captureViewport(page, testInfo, "substitution");
      await page.getByRole("button", { name: "Close substitution" }).click();

      await page.getByRole("button", { name: "End Quarter" }).click();
      await captureViewport(page, testInfo, "end-quarter-summary");
      await page.getByRole("button", { name: "Prepare Quarter 2 Court" }).click();
      await page.getByLabel("Goal Keeper").selectOption({ label: "Bea" });
      await page.getByRole("button", { name: "Open coach navigation" }).click();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await page.goBack();
      await expect(page.getByLabel("Goal Keeper").locator("option:checked")).toHaveText("Bea");
      await page.getByRole("button", { name: "Start Quarter 2" }).click();
      await page.getByRole("button", { name: "End Quarter" }).click();
      for (const quarter of [3, 4]) {
        await page.getByRole("button", { name: `Prepare Quarter ${quarter} Court` }).click();
        await page.getByRole("button", { name: `Start Quarter ${quarter}` }).click();
        await page.getByRole("button", { name: "End Quarter" }).click();
      }
      await page.getByRole("button", { name: "Confirm final score and finalise Match" }).click();
      await expect(page.getByText("This Match is finalised and read-only.")).toBeVisible();
      await expectFocusedStage(page);
      await captureViewport(page, testInfo, "terminal-match-events");

      await page.getByRole("button", { name: "Open coach navigation" }).click();
      await page.getByRole("button", { name: "History", exact: true }).click();
      await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
      await expectFocusedStage(page);
      await captureViewport(page, testInfo, "history");

      await page.getByRole("button", { name: "Open coach navigation" }).click();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expectFocusedStage(page);
      await captureViewport(page, testInfo, "settings");
      await page.getByRole("button", { name: "Backup & restore" }).click();
      const backup = page.locator(".backup-screen .backup-card");
      await expect(backup).toHaveCSS("overflow-y", "auto");
      await page.getByLabel("Backup data").fill(JSON.stringify({ large: "x".repeat(20000) }));
      await expectFocusedStage(page, page.getByRole("button", { name: "Import backup" }));
      await captureViewport(page, testInfo, "backup-and-restore");
    });
  });
}
