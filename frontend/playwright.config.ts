import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
  },
});
