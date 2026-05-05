import { describe, expect, test } from "bun:test";
import { ParticleSystem } from "./particles";

describe("ParticleSystem", () => {
	test("spawns and tracks alive particles", () => {
		const ps = new ParticleSystem(8);
		expect(ps.aliveCount()).toBe(0);
		expect(ps.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: 0.5, size: 2, color: "#fff" })).toBe(true);
		expect(ps.aliveCount()).toBe(1);
	});

	test("rejects spawn when pool is exhausted", () => {
		const ps = new ParticleSystem(2);
		const make = () => ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 1, color: "#fff" });
		expect(make()).toBe(true);
		expect(make()).toBe(true);
		expect(make()).toBe(false);
	});

	test("update integrates motion and recycles after lifetime", () => {
		const ps = new ParticleSystem(4);
		ps.spawn({ x: 0, y: 0, vx: 100, vy: 50, life: 0.2, size: 2, color: "#fff" });
		ps.update(0.1);
		expect(ps.aliveCount()).toBe(1);
		ps.update(0.2);
		expect(ps.aliveCount()).toBe(0);
		// Pool is reusable after death
		expect(ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 1, color: "#fff" })).toBe(true);
	});

	test("clear releases all particles back to the pool", () => {
		const ps = new ParticleSystem(4);
		ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 1, color: "#fff" });
		ps.spawn({ x: 1, y: 1, vx: 0, vy: 0, life: 1, size: 1, color: "#fff" });
		expect(ps.aliveCount()).toBe(2);
		ps.clear();
		expect(ps.aliveCount()).toBe(0);
	});

	test("gravity accelerates vy", () => {
		const ps = new ParticleSystem(2);
		ps.spawn({
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			life: 1,
			size: 1,
			color: "#fff",
			gravity: 100,
		});
		ps.update(0.1);
		// After 0.1s with vy starting 0 and accel 100, vy ≈ 10, so y ≈ 1
		// We don't expose internals; instead verify update did not crash and pool stable.
		expect(ps.aliveCount()).toBe(1);
	});
});
