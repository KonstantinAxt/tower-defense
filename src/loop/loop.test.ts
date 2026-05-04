import { beforeEach, describe, expect, test } from "bun:test";
import { Loop } from "./loop";

const FIXED_DT = 1 / 60;

interface Counts {
	updates: number;
	renders: number;
	lastDt: number;
	lastAlpha: number;
}

function makeLoop(opts?: { fixedDt?: number; maxFrameTime?: number }): {
	loop: Loop;
	counts: Counts;
} {
	const counts: Counts = { updates: 0, renders: 0, lastDt: 0, lastAlpha: -1 };
	const loop = new Loop(
		(dt) => {
			counts.updates++;
			counts.lastDt = dt;
		},
		(alpha) => {
			counts.renders++;
			counts.lastAlpha = alpha;
		},
		{ fixedDt: opts?.fixedDt ?? FIXED_DT, maxFrameTime: opts?.maxFrameTime },
	);
	return { loop, counts };
}

describe("Loop — fixed timestep", () => {
	let loop: Loop;
	let counts: Counts;

	beforeEach(() => {
		const made = makeLoop();
		loop = made.loop;
		counts = made.counts;
	});

	test("first step establishes baseline with no updates", () => {
		loop.step(0);
		expect(counts.updates).toBe(0);
		expect(counts.renders).toBe(1);
	});

	test("accumulates exact fixed steps", () => {
		loop.step(0);
		// 2 frames worth of time -> exactly 2 updates at 60Hz
		loop.step(FIXED_DT * 2 * 1000);
		expect(counts.updates).toBe(2);
		expect(counts.lastDt).toBeCloseTo(FIXED_DT, 10);
		expect(counts.renders).toBe(2);
	});

	test("carries residue between frames", () => {
		loop.step(0);
		// 1.5 * fixedDt -> 1 update, 0.5 residue
		loop.step(FIXED_DT * 1.5 * 1000);
		expect(counts.updates).toBe(1);
		expect(counts.lastAlpha).toBeCloseTo(0.5, 5);

		// another 1.5 * fixedDt -> total residue 1.0 -> 2 more updates
		loop.step(FIXED_DT * 3 * 1000);
		expect(counts.updates).toBe(3);
		expect(counts.lastAlpha).toBeCloseTo(0, 5);
	});

	test("clamps huge frame times to maxFrameTime (no spiral of death)", () => {
		const made = makeLoop({ maxFrameTime: 0.1 });
		made.loop.step(0);
		made.loop.step(10_000); // 10s wall-clock
		// clamped to 0.1s at 60Hz -> floor(0.1 / (1/60)) = 6 updates
		expect(made.counts.updates).toBe(6);
	});

	test("paused halts updates but still renders", () => {
		loop.step(0);
		loop.pause();
		loop.step(200); // ~12 fixed steps of wall time
		expect(counts.updates).toBe(0);
		expect(counts.renders).toBe(2);

		loop.resume();
		// resuming does NOT replay paused time — accumulator was frozen at 0
		loop.step(200 + 100); // +100ms = 6 fixed steps
		expect(counts.updates).toBe(6);
	});

	test("reset returns loop to pre-start state", () => {
		loop.step(0);
		loop.step(FIXED_DT * 5 * 1000);
		loop.reset();
		loop.step(0);
		loop.step(FIXED_DT * 2 * 1000);
		// only the post-reset frames count
		expect(counts.updates).toBe(5 + 2);
	});

	test("negative frame time is clamped to 0", () => {
		loop.step(100);
		loop.step(50); // clock went backwards
		expect(counts.updates).toBe(0);
		expect(counts.renders).toBe(2);
	});

	test("rejects non-positive fixedDt", () => {
		expect(() => makeLoop({ fixedDt: 0 })).toThrow();
		expect(() => makeLoop({ fixedDt: -1 })).toThrow();
	});
});
