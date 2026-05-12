import * as fs from "node:fs";
import * as path from "node:path";
import type { Page } from "@playwright/test";
import { test } from "@playwright/test";

const VARIANTS = ["A", "B", "C"] as const;

async function waitForBoot(page: Page): Promise<void> {
	await page.waitForFunction(
		() => Boolean((window as unknown as { __td?: { testApi?: unknown } }).__td?.testApi),
		{ timeout: 15_000 },
	);
}

for (const variant of VARIANTS) {
	test(`mid-wave screenshot — variant ${variant}`, async ({ page }) => {
		const outDir = path.join(process.cwd(), "test-results");
		fs.mkdirSync(outDir, { recursive: true });

		await page.goto(`/?ui=${variant}`);
		await waitForBoot(page);

		// Build a small loadout so there's combat activity on screen.
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			const api = (window as any).__td.testApi;
			api.buyTower(0, "cannon");
			api.buyTower(1, "cannon");
			api.buyTower(3, "mortar");
		});

		// Close build menu and start wave 1.
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			const api = (window as any).__td.testApi;
			api.closeMenu();
			api.startWave();
		});

		// Wait until enemies are actually spawning.
		await page.waitForFunction(
			() => {
				// biome-ignore lint/suspicious/noExplicitAny: test-only window access
				const s = (window as any).__td.testApi.getState();
				return s.state === "spawning";
			},
			{ timeout: 10_000 },
		);

		// Let one second of game time elapse so enemies are visibly mid-path.
		await page.waitForTimeout(1_000);

		const outPath = path.join(outDir, `variant-${variant.toLowerCase()}.png`);
		await page.screenshot({ path: outPath, fullPage: false });
	});
}
