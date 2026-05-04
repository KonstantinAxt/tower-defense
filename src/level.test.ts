import { describe, expect, test } from "bun:test";
import {
	BUILD_SLOTS,
	BUILD_SLOT_RADIUS,
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	PATH,
	PATH_WIDTH,
} from "./level";

describe("level", () => {
	test("path has at least an entrance and an exit", () => {
		expect(PATH.length).toBeGreaterThanOrEqual(2);
	});

	test("path waypoints are finite numbers", () => {
		for (const p of PATH) {
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});

	test("path entrance and exit extend off-canvas so enemies walk in/out", () => {
		const first = PATH[0];
		const last = PATH[PATH.length - 1];
		if (!first || !last) throw new Error("PATH must have endpoints");
		const entranceOff = first.x < 0 || first.x > CANVAS_WIDTH;
		const exitOff = last.x < 0 || last.x > CANVAS_WIDTH;
		expect(entranceOff).toBe(true);
		expect(exitOff).toBe(true);
	});

	test("consecutive waypoints differ so path has non-zero segments", () => {
		for (let i = 1; i < PATH.length; i++) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) throw new Error("unreachable");
			expect(a.x !== b.x || a.y !== b.y).toBe(true);
		}
	});

	test("build slots exist and sit within the canvas bounds", () => {
		expect(BUILD_SLOTS.length).toBeGreaterThanOrEqual(3);
		for (const slot of BUILD_SLOTS) {
			expect(slot.x).toBeGreaterThanOrEqual(0);
			expect(slot.x).toBeLessThanOrEqual(CANVAS_WIDTH);
			expect(slot.y).toBeGreaterThanOrEqual(0);
			expect(slot.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
		}
	});

	test("build slots do not visually collide with the path corridor", () => {
		const half = PATH_WIDTH / 2 + BUILD_SLOT_RADIUS;
		for (const slot of BUILD_SLOTS) {
			for (let i = 1; i < PATH.length; i++) {
				const a = PATH[i - 1];
				const b = PATH[i];
				if (!a || !b) continue;
				const d = distanceToSegment(slot.x, slot.y, a.x, a.y, b.x, b.y);
				expect(d).toBeGreaterThanOrEqual(half);
			}
		}
	});
});

function distanceToSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	const cx = ax + t * dx;
	const cy = ay + t * dy;
	return Math.hypot(px - cx, py - cy);
}
