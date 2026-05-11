import { defineConfig, devices } from "@playwright/test";
import type { UiOptions } from "./e2e/fixtures";

export default defineConfig<UiOptions>({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	projects: [
		{ name: "ui-a", use: { ...devices["Desktop Chrome"], variant: "A" } },
		{ name: "ui-b", use: { ...devices["Desktop Chrome"], variant: "B" } },
		{ name: "ui-c", use: { ...devices["Desktop Chrome"], variant: "C" } },
	],
	webServer: {
		command: "bun run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
