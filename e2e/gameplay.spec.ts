import { type Page, expect, test } from "@playwright/test";
import { BUILD_SLOTS } from "../src/level";
import { SAVE_KEY } from "../src/save";

const SLOT_LOADOUT: ReadonlyArray<{ slot: number; kind: "cannon" | "mg" | "mortar" }> = [
	{ slot: 0, kind: "cannon" },
	{ slot: 1, kind: "cannon" },
	{ slot: 3, kind: "cannon" },
	{ slot: 5, kind: "cannon" },
	{ slot: 6, kind: "cannon" },
];

interface ControllerState {
	state: "idle" | "spawning" | "clearing" | "won" | "lost";
	currentWave: number;
	gold: number;
	lives: number;
	wave: number;
	towers: number;
}

async function waitForBoot(page: Page): Promise<void> {
	await page.waitForFunction(() => Boolean((window as unknown as { __td?: unknown }).__td), {
		timeout: 15_000,
	});
}

async function getState(page: Page): Promise<ControllerState> {
	return page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: test-only window access
		const td = (window as any).__td;
		return {
			state: td.controller.state,
			currentWave: td.controller.currentWave,
			gold: td.world.gold,
			lives: td.world.lives,
			wave: td.world.wave,
			towers: td.world.query("Tower").length,
		};
	});
}

async function buildTowerOnSlot(
	page: Page,
	slotIndex: number,
	kind: "cannon" | "mg" | "mortar",
): Promise<void> {
	const slot = BUILD_SLOTS[slotIndex];
	if (!slot) throw new Error(`unknown slot ${slotIndex}`);

	const canvas = page.getByTestId("game-canvas");
	await canvas.click({ position: { x: slot.x, y: slot.y } });

	const buildBtn = page.locator(`[data-action="build"][data-kind="${kind}"]`);
	await expect(buildBtn).toBeVisible();
	await buildBtn.click();
}

async function closeBuildMenu(page: Page): Promise<void> {
	// Click somewhere on the canvas that is not a build slot.
	const canvas = page.getByTestId("game-canvas");
	await canvas.click({ position: { x: 10, y: 10 } });
}

// TODO(issue 006): re-enable once the 3D renderer mounts and gameplay UI works end-to-end.
test.describe.skip("gameplay e2e", () => {
	test("places towers, runs waves, save/loads, reaches win or substantial progress", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto("/");
		await waitForBoot(page);

		// Start from a clean slate so a stale save from a previous run
		// doesn't enable Load before we Save below.
		await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
		await page.reload();
		await waitForBoot(page);

		const canvas = page.getByTestId("game-canvas");
		await expect(canvas).toBeVisible();

		// HUD baseline.
		await expect(page.getByTestId("hud-gold")).toHaveText("250");
		await expect(page.getByTestId("hud-lives")).toHaveText("20");
		await expect(page.getByTestId("hud-wave")).toHaveText("1");

		// Save/Load disabled at the very start (no save yet).
		await expect(page.getByTestId("load-button")).toBeDisabled();
		await expect(page.getByTestId("save-button")).toBeEnabled();

		// Build the loadout.
		for (const { slot, kind } of SLOT_LOADOUT) {
			await buildTowerOnSlot(page, slot, kind);
		}
		await closeBuildMenu(page);

		// 5 cannons at 50 gold each = 250 spent.
		await expect(page.getByTestId("hud-gold")).toHaveText("0");
		const initial = await getState(page);
		expect(initial.towers).toBe(SLOT_LOADOUT.length);

		// --- Wave 1 ---
		const waveBtn = page.getByTestId("wave-button");
		await expect(waveBtn).toBeEnabled();
		await waveBtn.click();
		await expect.poll(async () => (await getState(page)).state).toBe("spawning");

		// Speed up.
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.loop.setSpeed(20);
		});

		// Wait until controller advances past wave 1 (idle on wave 2 or later).
		await expect
			.poll(async () => (await getState(page)).currentWave, { timeout: 30_000 })
			.toBeGreaterThanOrEqual(2);

		// HUD reflects new wave.
		await expect.poll(async () => (await getState(page)).state).toBe("idle");
		await expect(page.getByTestId("hud-wave")).toHaveText("2");

		// Lives shouldn't have collapsed (loadout should comfortably hold wave 1).
		const afterWave1 = await getState(page);
		expect(afterWave1.lives).toBeGreaterThan(0);

		// --- Save / Load round-trip ---
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.loop.setSpeed(1);
		});

		await expect(page.getByTestId("save-button")).toBeEnabled();
		await page.getByTestId("save-button").click();

		const savedRaw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
		expect(savedRaw).not.toBeNull();
		const saved = JSON.parse(savedRaw as string) as {
			currentWave: number;
			towers: { kind: string; slotIndex: number }[];
			gold: number;
			lives: number;
		};
		expect(saved.currentWave).toBe(2);
		expect(saved.towers.length).toBe(SLOT_LOADOUT.length);
		expect(saved.lives).toBe(afterWave1.lives);

		// Reload, then load.
		await page.reload();
		await waitForBoot(page);
		await expect(page.getByTestId("hud-wave")).toHaveText("1");
		await expect(page.getByTestId("hud-gold")).toHaveText("250");

		const loadBtn = page.getByTestId("load-button");
		await expect(loadBtn).toBeEnabled();
		await loadBtn.click();

		await expect(page.getByTestId("hud-wave")).toHaveText("2");
		const restored = await getState(page);
		expect(restored.towers).toBe(SLOT_LOADOUT.length);
		expect(restored.lives).toBe(afterWave1.lives);

		// --- Pause works ---
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.loop.setSpeed(20);
		});
		const pauseBtn = page.getByTestId("pause-button");
		await pauseBtn.click();
		await expect(pauseBtn).toHaveText("Resume");
		await expect
			.poll(async () =>
				page.evaluate(() => {
					// biome-ignore lint/suspicious/noExplicitAny: test-only window access
					return Boolean((window as any).__td.loop.isPaused());
				}),
			)
			.toBe(true);
		await pauseBtn.click();
		await expect(pauseBtn).toHaveText("Pause");

		// --- Auto-run remaining waves with greedy upgrades ---
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			const td = (window as any).__td;
			td.loop.setSpeed(40);
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td_runner = setInterval(() => {
				if (td.controller.state === "idle" && td.controller.currentWave <= 10) {
					td.upgradeAffordable();
					td.startWave();
				}
				if (td.controller.state === "won" || td.controller.state === "lost") {
					// biome-ignore lint/suspicious/noExplicitAny: test-only window access
					clearInterval((window as any).__td_runner);
				}
			}, 80);
		});

		// Wait for terminal state (or wave >= 6 as a substantial-progress fallback).
		await expect
			.poll(
				async () => {
					const s = await getState(page);
					if (s.state === "won" || s.state === "lost") return "terminal";
					if (s.currentWave >= 6) return "progress";
					return "running";
				},
				{ timeout: 90_000, intervals: [200, 500, 1000] },
			)
			.toMatch(/terminal|progress/);

		const finalState = await getState(page);

		// Assert either a win OR substantial progress (currentWave >= 6 in a non-lost state).
		const won = finalState.state === "won";
		const progressed = finalState.currentWave >= 6 && finalState.state !== "lost";
		expect(won || progressed).toBe(true);

		if (won) {
			await expect(page.getByTestId("win-modal")).toHaveClass(/open/);
		}

		// No console / page errors throughout.
		expect(errors).toEqual([]);
	});
});
