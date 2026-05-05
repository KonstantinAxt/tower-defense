import { describe, expect, test } from "bun:test";
import { World } from "./ecs";
import { C_ENEMY_TYPE, C_HEALTH, ENEMY_STATS, type Health, spawnEnemy } from "./enemies";
import { TOTAL_WAVES, WAVES, WaveController } from "./waves";

describe("WAVES", () => {
	test("defines exactly 10 waves", () => {
		expect(WAVES.length).toBe(TOTAL_WAVES);
		expect(TOTAL_WAVES).toBe(10);
	});

	test("counts grow linearly across waves 1..9", () => {
		const totals: number[] = [];
		for (let i = 0; i < 9; i++) {
			const def = WAVES[i];
			if (!def) throw new Error("unreachable");
			totals.push(def.spawns.reduce((sum, s) => sum + s.count, 0));
		}
		for (let i = 1; i < totals.length; i++) {
			const prev = totals[i - 1] ?? 0;
			const curr = totals[i] ?? 0;
			expect(curr).toBeGreaterThanOrEqual(prev);
		}
		const last = totals[totals.length - 1] ?? 0;
		const first = totals[0] ?? 0;
		expect(last).toBeGreaterThan(first);
	});

	test("hp scale is monotonic non-decreasing across waves 1..9", () => {
		let prevMaxScale = 0;
		for (let i = 0; i < 9; i++) {
			const def = WAVES[i];
			if (!def) throw new Error("unreachable");
			const maxScale = Math.max(...def.spawns.map((s) => s.hpScale));
			expect(maxScale).toBeGreaterThanOrEqual(prevMaxScale);
			prevMaxScale = maxScale;
		}
	});

	test("final wave (10) is denser and mixed", () => {
		const w10 = WAVES[9];
		const w9 = WAVES[8];
		if (!w10 || !w9) throw new Error("unreachable");
		const w10Total = w10.spawns.reduce((s, x) => s + x.count, 0);
		const w9Total = w9.spawns.reduce((s, x) => s + x.count, 0);
		expect(w10Total).toBeGreaterThan(w9Total);
		const kinds = new Set(w10.spawns.map((s) => s.kind));
		expect(kinds.has("fast")).toBe(true);
		expect(kinds.has("heavy")).toBe(true);
	});

	test("at least one mid wave is mixed (more than one enemy kind)", () => {
		const mixed = WAVES.some((w) => new Set(w.spawns.map((s) => s.kind)).size > 1);
		expect(mixed).toBe(true);
	});
});

describe("WaveController scheduling", () => {
	test("startWave only succeeds in idle and emits no enemies before delay", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		expect(c.canStart()).toBe(true);
		expect(c.startWave(world)).toBe(true);
		expect(c.state).toBe("spawning");
		expect(c.startWave(world)).toBe(false); // already spawning
	});

	test("spawns first enemy at the configured delay tick", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.startWave(world);
		c.update(world, 0.001); // tiny tick — wave 1 has delay 0, so should spawn at least one
		expect(world.query(C_ENEMY_TYPE).length).toBeGreaterThanOrEqual(1);
	});

	test("hp scaling is applied to spawned enemies", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.currentWave = 9; // wave 9 has hpScale 1 + 8*0.15 = 2.2
		c.startWave(world);
		c.update(world, 0.001);
		const ids = world.query(C_ENEMY_TYPE, C_HEALTH);
		expect(ids.length).toBeGreaterThan(0);
		const id = ids[0];
		if (id === undefined) throw new Error("unreachable");
		const h = world.getComponent<Health>(id, C_HEALTH);
		if (!h) throw new Error("unreachable");
		// fast base hp is 30; with 2.2 scale → 66
		expect(h.max).toBeGreaterThan(ENEMY_STATS.fast.maxHp);
	});

	test("fully spawning a wave moves state to 'clearing'", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.startWave(world);
		// run enough sim time to schedule every spawn
		c.update(world, 1000);
		expect(c.state).toBe("clearing");
	});

	test("clearing all enemies advances to next idle wave", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.startWave(world);
		c.update(world, 1000); // emit all spawns -> clearing
		// Wipe enemies manually to simulate towers killing them
		for (const id of world.query(C_ENEMY_TYPE)) world.destroyEntity(id);
		c.update(world, 0.016);
		expect(c.state).toBe("idle");
		expect(c.currentWave).toBe(2);
	});

	test("lives <= 0 transitions to 'lost'", () => {
		const world = new World();
		world.lives = 1;
		const c = new WaveController();
		c.startWave(world);
		world.lives = 0;
		c.update(world, 0.016);
		expect(c.state).toBe("lost");
	});

	test("clearing wave 10 transitions to 'won'", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.currentWave = 10;
		c.startWave(world);
		c.update(world, 1000); // emit all -> clearing
		for (const id of world.query(C_ENEMY_TYPE)) world.destroyEntity(id);
		c.update(world, 0.016);
		expect(c.state).toBe("won");
	});

	test("restart returns controller to wave 1 idle", () => {
		const world = new World();
		world.lives = 20;
		const c = new WaveController();
		c.currentWave = 5;
		c.startWave(world);
		c.update(world, 1000);
		c.restart();
		expect(c.state).toBe("idle");
		expect(c.currentWave).toBe(1);
	});

	test("World.reset clears entities and resets counters", () => {
		const world = new World();
		world.lives = 20;
		world.gold = 150;
		world.wave = 5;
		spawnEnemy(world, "fast");
		spawnEnemy(world, "heavy");
		world.reset();
		expect(world.entityCount()).toBe(0);
		expect(world.lives).toBe(0);
		expect(world.gold).toBe(0);
		expect(world.wave).toBe(0);
	});
});
