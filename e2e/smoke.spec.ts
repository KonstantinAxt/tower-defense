import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function waitForBoot(page: Page): Promise<void> {
	await page.waitForFunction(
		() => Boolean((window as unknown as { __td?: { testApi?: unknown } }).__td?.testApi),
		{ timeout: 15_000 },
	);
}

test("page loads, canvas mounts, and the test API is exposed", async ({ page, variant }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto(`/?ui=${variant}`);
	await waitForBoot(page);

	await expect(page.getByTestId("game-canvas")).toBeVisible();

	const size = await page.getByTestId("game-canvas").evaluate((el) => {
		const c = el as HTMLCanvasElement;
		return { w: c.width, h: c.height };
	});
	expect(size.w).toBeGreaterThan(0);
	expect(size.h).toBeGreaterThan(0);

	const initial = await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: test-only window access
		return (window as any).__td.testApi.getState();
	});
	expect(initial.gold).toBe(250);
	expect(initial.lives).toBe(20);
	expect(initial.wave).toBe(1);
	expect(initial.state).toBe("idle");
	expect(initial.towers).toBe(0);

	expect(errors).toEqual([]);
});
