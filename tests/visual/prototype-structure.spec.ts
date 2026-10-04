import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../../src/", import.meta.url);

test("keeps the prototype shell and removes obsolete design-system surfaces", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("app.tsx", sourcePath), "utf8"),
    readFile(new URL("styles.css", sourcePath), "utf8"),
  ]);

  expect(app).toContain('className="app-top-bar"');
  expect(app).not.toMatch(/coach-navigation(?:-item|-items)?/);
  expect(app).not.toContain("function NavigationIcon");
  expect(app).not.toMatch(/className=["'](?:scoreboard|court-toolbar|active-event-feed|live-card-grid|stat-button)\b/);
  expect(styles).toContain(".app-top-bar");
  expect(styles).not.toMatch(/\.coach-navigation(?:-item|-items)?\b/);
  expect(styles).not.toMatch(/\.(?:foundation-preview|foundation-grid|ui-(?:button|card|input|select|tabs|dialog|drawer|overlay))\b/);
  expect(styles).not.toMatch(/\.(?:scoreboard|court-toolbar|active-event-feed|live-card-grid|stat-button)\b/);
  expect(styles).not.toMatch(/\.app-top-bar[^}]*\{[^}]*\b(?:display:\s*none|visibility:\s*hidden|opacity:\s*0)/s);
});
