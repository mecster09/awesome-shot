import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Natball Insights",
        short_name: "Natball",
        description: "Offline netball match statistics.",
        theme_color: "#b5122b",
        background_color: "#fff8f8",
        display: "standalone",
        icons: [{ src: "/natball-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
      }
    })
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"]
  }
});
