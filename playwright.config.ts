import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  use: {
    baseURL: "http://127.0.0.1:4177",
    browserName: "chromium",
    channel: "msedge",
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4177",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
  },
});
