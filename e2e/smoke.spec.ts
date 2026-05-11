import { expect, test } from "@playwright/test";

// TODO(issue 006): re-enable once the 3D renderer mounts the game canvas.
test.skip("page loads and the game canvas is present", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(e.message));
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});

	await page.goto("/");
	await expect(page.getByTestId("game-canvas")).toBeVisible();

	const size = await page.getByTestId("game-canvas").evaluate((el) => {
		const c = el as HTMLCanvasElement;
		return { w: c.width, h: c.height };
	});
	expect(size.w).toBeGreaterThan(0);
	expect(size.h).toBeGreaterThan(0);

	expect(errors).toEqual([]);
});
