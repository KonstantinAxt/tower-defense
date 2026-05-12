import type { Page } from "@playwright/test";
import { SAVE_KEY } from "../src/save";
import { expect, test } from "./fixtures";

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
	await page.waitForFunction(
		() => Boolean((window as unknown as { __td?: { testApi?: unknown } }).__td?.testApi),
		{ timeout: 15_000 },
	);
}

async function getState(page: Page): Promise<ControllerState> {
	return page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: test-only window access
		return (window as any).__td.testApi.getState() as ControllerState;
	});
}

async function buildTowerOnSlot(
	page: Page,
	slotIndex: number,
	kind: "cannon" | "mg" | "mortar",
): Promise<void> {
	const ok = await page.evaluate(
		({ slotIndex, kind }) => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			const api = (window as any).__td.testApi;
			api.clickSlot(slotIndex);
			return api.buyTower(slotIndex, kind);
		},
		{ slotIndex, kind },
	);
	expect(ok).toBe(true);
}

async function closeBuildMenu(page: Page): Promise<void> {
	await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: test-only window access
		(window as any).__td.testApi.closeMenu();
	});
}

test.describe("gameplay e2e", () => {
	test("places towers, runs waves, save/loads, reaches win or substantial progress", async ({
		page,
		variant,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		page.on("console", (msg) => {
			if (msg.type() === "error") errors.push(msg.text());
		});

		await page.goto(`/?ui=${variant}`);
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

		// Build the loadout via the state-based test API.
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
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.testApi.startWave();
		});
		await expect.poll(async () => (await getState(page)).state).toBe("spawning");

		// Speed up.
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.testApi.setSpeed(20);
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
			(window as any).__td.testApi.setSpeed(1);
		});

		const saved = await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			return (window as any).__td.testApi.save() as boolean;
		});
		expect(saved).toBe(true);

		const savedRaw = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
		expect(savedRaw).not.toBeNull();
		const savedSnap = JSON.parse(savedRaw as string) as {
			currentWave: number;
			towers: { kind: string; slotIndex: number }[];
			gold: number;
			lives: number;
		};
		expect(savedSnap.currentWave).toBe(2);
		expect(savedSnap.towers.length).toBe(SLOT_LOADOUT.length);
		expect(savedSnap.lives).toBe(afterWave1.lives);

		// Reload, then load.
		await page.reload();
		await waitForBoot(page);
		await expect(page.getByTestId("hud-wave")).toHaveText("1");
		await expect(page.getByTestId("hud-gold")).toHaveText("250");

		const loadOk = await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			return (window as any).__td.testApi.load() as boolean;
		});
		expect(loadOk).toBe(true);

		await expect(page.getByTestId("hud-wave")).toHaveText("2");
		const restored = await getState(page);
		expect(restored.towers).toBe(SLOT_LOADOUT.length);
		expect(restored.lives).toBe(afterWave1.lives);

		// --- Pause works ---
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.testApi.setSpeed(20);
		});
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.testApi.pause();
		});
		await expect
			.poll(async () =>
				page.evaluate(() => {
					// biome-ignore lint/suspicious/noExplicitAny: test-only window access
					return Boolean((window as any).__td.testApi.isPaused());
				}),
			)
			.toBe(true);
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td.testApi.resume();
		});

		// --- Auto-run remaining waves with greedy upgrades ---
		await page.evaluate(() => {
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			const api = (window as any).__td.testApi;
			api.setSpeed(40);
			// biome-ignore lint/suspicious/noExplicitAny: test-only window access
			(window as any).__td_runner = setInterval(() => {
				const state = api.getState();
				if (state.state === "idle" && state.currentWave <= 10) {
					api.upgradeAffordable();
					api.startWave();
				}
				if (state.state === "won" || state.state === "lost") {
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
