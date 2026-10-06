import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const galaxyTabS9Viewports = [
  { label: "landscape", width: 1205, height: 729 },
  { label: "portrait", width: 753, height: 1180 },
] as const;

type Rect = { top: number; right: number; bottom: number; left: number; width: number; height: number };

const visibleRects = async (locator: Locator): Promise<Rect[]> => locator.evaluateAll((elements) => elements
  .filter((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  })
  .map((element) => {
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
    return { top, right, bottom, left, width, height };
  }));

const expectViewportContract = async (page: Page, primaryAction: Locator) => {
  await expect(page.locator(".app-top-bar")).toBeVisible();
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toBeInViewport();

  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const shell = document.querySelector(".app-shell")!.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      overflow: {
        horizontal: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
        vertical: Math.max(root.scrollHeight, body.scrollHeight) - window.innerHeight,
      },
      shell: { top: shell.top, right: shell.right, bottom: shell.bottom, left: shell.left },
    };
  });

  expect(geometry.overflow.horizontal).toBeLessThanOrEqual(1);
  expect(geometry.overflow.vertical).toBeLessThanOrEqual(1);
  expect(geometry.shell.top).toBeGreaterThanOrEqual(0);
  expect(geometry.shell.left).toBeGreaterThanOrEqual(0);
  expect(geometry.shell.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.shell.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);

  await page.evaluate(() => window.scrollTo(100, 100));
  await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual({ x: 0, y: 0 });

  const actionRects = await visibleRects(page.locator("button"));
  for (const rect of actionRects) {
    expect.soft(rect.width, "custom action width").toBeGreaterThanOrEqual(48);
    expect.soft(rect.height, "custom action height").toBeGreaterThanOrEqual(48);
    expect.soft(rect.top, "custom action clipped above viewport").toBeGreaterThanOrEqual(0);
    expect.soft(rect.left, "custom action clipped left of viewport").toBeGreaterThanOrEqual(0);
    expect.soft(rect.right, "custom action clipped right of viewport").toBeLessThanOrEqual(geometry.viewport.width);
    expect.soft(rect.bottom, "custom action clipped below viewport").toBeLessThanOrEqual(geometry.viewport.height);
  }

  for (let left = 0; left < actionRects.length; left += 1) {
    for (let right = left + 1; right < actionRects.length; right += 1) {
      const a = actionRects[left];
      const b = actionRects[right];
      const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect.soft(overlapWidth > 0 && overlapHeight > 0, "custom action hit areas overlap").toBe(false);
    }
  }

  const edgeControlRects = await visibleRects(page.locator(".app-top-bar button, .primary-action-bar button, .no-match-screen button"));
  for (const rect of edgeControlRects) {
    expect.soft(rect.top, "edge control top spacing").toBeGreaterThanOrEqual(16);
    expect.soft(geometry.viewport.width - rect.right, "edge control right spacing").toBeGreaterThanOrEqual(16);
    expect.soft(geometry.viewport.height - rect.bottom, "edge control bottom spacing").toBeGreaterThanOrEqual(16);
    expect.soft(rect.left, "edge control left spacing").toBeGreaterThanOrEqual(16);
  }

  const requiredRegions = await page.locator(".app-top-bar, .top-bar-identity, .app-content, .startup-state-card, .setup-flow-card, .no-match-card, h1, h2, label, input, button").evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      let clippingAncestor = element.parentElement;
      let visibleTop = 0;
      let visibleRight = window.innerWidth;
      let visibleBottom = window.innerHeight;
      let visibleLeft = 0;
      while (clippingAncestor) {
        const overflow = getComputedStyle(clippingAncestor);
        if ([overflow.overflow, overflow.overflowX, overflow.overflowY].some((value) => value === "hidden" || value === "auto" || value === "scroll")) {
          const ancestorRect = clippingAncestor.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, ancestorRect.top);
          visibleRight = Math.min(visibleRight, ancestorRect.right);
          visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
          visibleLeft = Math.max(visibleLeft, ancestorRect.left);
        }
        clippingAncestor = clippingAncestor.parentElement;
      }
      return {
        label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 40) ?? element.tagName,
        clipped: rect.top < visibleTop - 1 || rect.right > visibleRight + 1 || rect.bottom > visibleBottom + 1 || rect.left < visibleLeft - 1,
      };
    }));
  for (const region of requiredRegions) expect.soft(region.clipped, `required region clipped: ${region.label}`).toBe(false);
};

const captureViewport = async (page: Page, testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
};

for (const viewport of galaxyTabS9Viewports) {
  test.describe(`installed PWA viewport at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 });

    test("keeps loading and storage failure inside the visual viewport", async ({ browser }, testInfo) => {
      const loadingContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const loadingPage = await loadingContext.newPage();
      await loadingPage.addInitScript(() => {
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) {
          const request = open.apply(this, args);
          return new Proxy(request, {
            get: (target, property) => Reflect.get(target, property, target),
            set: (target, property, value) => {
              if (property === "onsuccess" && typeof value === "function") {
                target.onsuccess = (event) => window.setTimeout(() => value.call(target, event), 500);
                return true;
              }
              return Reflect.set(target, property, value, target);
            },
          });
        };
      });
      await loadingPage.goto("/");
      await expect(loadingPage.locator(".loading")).toBeVisible();
      await expectViewportContract(loadingPage, loadingPage.getByRole("button", { name: "Preparing offline workspace…" }));
      await captureViewport(loadingPage, testInfo, `loading-${viewport.label}`);
      await loadingContext.close();

      const errorContext = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const errorPage = await errorContext.newPage();
      await errorPage.addInitScript(() => {
        IDBFactory.prototype.open = function () {
          throw new Error("storage unavailable");
        };
      });
      await errorPage.goto("/");
      await expect(errorPage.getByText("Natball Insights could not open its local storage.")).toBeVisible();
      await expectViewportContract(errorPage, errorPage.getByRole("button", { name: "Retry local storage" }));
      await captureViewport(errorPage, testInfo, `storage-error-${viewport.label}`);
      await errorContext.close();
    });

    test("keeps Focused stages complete without document scrolling", async ({ page }, testInfo) => {
      await page.goto("/");
      await expectViewportContract(page, page.getByRole("button", { name: "Next: Setup Season" }));
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
      const nativeTouchPolicy = await page.evaluate(() => {
        const rootStyle = getComputedStyle(document.documentElement);
        const buttonStyle = getComputedStyle(document.querySelector("button")!);
        const inputStyle = getComputedStyle(document.querySelector("input")!);
        const textStyle = getComputedStyle(document.querySelector("p")!);
        const graphicStyle = getComputedStyle(document.querySelector("svg")!);
        const image = document.createElement("img");
        image.alt = "Policy probe";
        document.body.append(image);
        const imageStyle = getComputedStyle(image);
        const imagePolicy = {
          selection: imageStyle.userSelect,
          drag: (imageStyle as CSSStyleDeclaration & { webkitUserDrag: string }).webkitUserDrag,
        };
        image.remove();
        return {
          overscroll: rootStyle.overscrollBehavior,
          tapHighlight: buttonStyle.webkitTapHighlightColor,
          buttonSelection: buttonStyle.userSelect,
          inputSelection: inputStyle.userSelect,
          textSelection: textStyle.userSelect,
          graphicSelection: graphicStyle.userSelect,
          graphicDrag: (graphicStyle as CSSStyleDeclaration & { webkitUserDrag: string }).webkitUserDrag,
          imagePolicy,
        };
      });
      expect(nativeTouchPolicy.overscroll).toBe("none");
      expect(nativeTouchPolicy.tapHighlight).toBe("rgba(0, 0, 0, 0)");
      expect(nativeTouchPolicy.buttonSelection).toBe("none");
      expect(nativeTouchPolicy.inputSelection).not.toBe("none");
      expect(nativeTouchPolicy.textSelection).not.toBe("none");
      expect(nativeTouchPolicy.graphicSelection).toBe("none");
      expect(nativeTouchPolicy.graphicDrag).toBe("none");
      expect(nativeTouchPolicy.imagePolicy).toEqual({ selection: "none", drag: "none" });

      await page.evaluate(() => {
        const root = document.documentElement.style;
        root.setProperty("--safe-area-top", "12px");
        root.setProperty("--safe-area-right", "12px");
        root.setProperty("--safe-area-bottom", "12px");
        root.setProperty("--safe-area-left", "12px");
      });
      const safeAreaGeometry = await page.evaluate(() => {
        const menu = document.querySelector(".app-top-bar button")!.getBoundingClientRect();
        const shell = getComputedStyle(document.querySelector(".app-shell")!);
        return { menuTop: menu.top, menuLeft: menu.left, shellRight: shell.paddingRight, shellBottom: shell.paddingBottom, shellLeft: shell.paddingLeft };
      });
      expect(safeAreaGeometry).toEqual({ menuTop: 28, menuLeft: 70, shellRight: "28px", shellBottom: "28px", shellLeft: "28px" });
      await page.evaluate(() => document.documentElement.removeAttribute("style"));
      await captureViewport(page, testInfo, `setup-team-${viewport.label}`);

      await page.getByLabel("Team name").fill("Roses");
      await page.getByRole("button", { name: "Next: Setup Season" }).click();
      await expectViewportContract(page, page.getByRole("button", { name: "Next: Setup Match & Squad" }));
      await captureViewport(page, testInfo, `setup-season-${viewport.label}`);

      await page.getByLabel("Season title").fill("2026 Winter");
      await page.getByRole("button", { name: "Next: Setup Match & Squad" }).click();
      await expectViewportContract(page, page.getByRole("button", { name: "Start Match setup" }));
      await captureViewport(page, testInfo, `no-match-${viewport.label}`);
    });
  });
}

test("generated manifest prefers fullscreen with standalone fallback", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display_override).toEqual(["fullscreen", "standalone"]);
  expect(manifest.display).toBe("standalone");
});
