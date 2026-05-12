import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	testMatch: "**/screenshots.spec.ts",
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:5173",
		trace: "off",
	},
	projects: [{ name: "screenshots", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "bun run dev",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
