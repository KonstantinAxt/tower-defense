import { describe, expect, test } from "bun:test";
import {
	BUILD_SLOTS,
	BUILD_SLOT_RADIUS,
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	PATH,
	PATH_TOTAL_LENGTH,
	PATH_WIDTH,
	positionAtDistance,
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

describe("positionAtDistance", () => {
	test("PATH_TOTAL_LENGTH equals sum of segment lengths", () => {
		let expected = 0;
		for (let i = 1; i < PATH.length; i++) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) throw new Error("unreachable");
			expected += Math.hypot(b.x - a.x, b.y - a.y);
		}
		expect(PATH_TOTAL_LENGTH).toBeCloseTo(expected, 6);
	});

	test("distance 0 lands on the entrance waypoint", () => {
		const first = PATH[0];
		if (!first) throw new Error("unreachable");
		const pose = positionAtDistance(0);
		expect(pose.x).toBeCloseTo(first.x, 6);
		expect(pose.y).toBeCloseTo(first.y, 6);
		// tangent is a unit vector
		expect(Math.hypot(pose.dirX, pose.dirY)).toBeCloseTo(1, 6);
	});

	test("distance >= total clamps to the exit and points outward", () => {
		const last = PATH[PATH.length - 1];
		const prev = PATH[PATH.length - 2];
		if (!last || !prev) throw new Error("unreachable");
		const pose = positionAtDistance(PATH_TOTAL_LENGTH + 1000);
		expect(pose.x).toBeCloseTo(last.x, 6);
		expect(pose.y).toBeCloseTo(last.y, 6);
		const len = Math.hypot(last.x - prev.x, last.y - prev.y);
		expect(pose.dirX).toBeCloseTo((last.x - prev.x) / len, 6);
		expect(pose.dirY).toBeCloseTo((last.y - prev.y) / len, 6);
	});

	test("midpoint of the first segment is linearly interpolated", () => {
		const a = PATH[0];
		const b = PATH[1];
		if (!a || !b) throw new Error("unreachable");
		const segLen = Math.hypot(b.x - a.x, b.y - a.y);
		const pose = positionAtDistance(segLen / 2);
		expect(pose.x).toBeCloseTo((a.x + b.x) / 2, 6);
		expect(pose.y).toBeCloseTo((a.y + b.y) / 2, 6);
	});

	test("tangent matches the current segment direction", () => {
		const a = PATH[0];
		const b = PATH[1];
		if (!a || !b) throw new Error("unreachable");
		const pose = positionAtDistance(5);
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		expect(pose.dirX).toBeCloseTo((b.x - a.x) / len, 6);
		expect(pose.dirY).toBeCloseTo((b.y - a.y) / len, 6);
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
