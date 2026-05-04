import { describe, expect, test } from "bun:test";
import type { SpriteMap } from "./assets/loader";
import { World } from "./ecs";
import {
	C_ENEMY_TYPE,
	C_HEALTH,
	C_PATH_FOLLOW,
	C_POSITION,
	C_VELOCITY,
	ENEMY_STATS,
	type EnemyType,
	type Health,
	type PathFollow,
	type Position,
	type Velocity,
	movementSystem,
	renderEnemies,
	spawnEnemy,
} from "./enemies";
import { PATH, PATH_TOTAL_LENGTH } from "./level";

describe("ENEMY_STATS", () => {
	test("fast and heavy are meaningfully different", () => {
		const fast = ENEMY_STATS.fast;
		const heavy = ENEMY_STATS.heavy;
		expect(fast.speed).toBeGreaterThan(heavy.speed);
		expect(heavy.maxHp).toBeGreaterThan(fast.maxHp);
		expect(heavy.bounty).toBeGreaterThan(fast.bounty);
		expect(heavy.leakDamage).toBeGreaterThanOrEqual(fast.leakDamage);
	});

	test("use distinct Kenney sprites", () => {
		expect(ENEMY_STATS.fast.sprite).toBe("enemy_fast");
		expect(ENEMY_STATS.heavy.sprite).toBe("enemy_heavy");
	});
});

describe("spawnEnemy", () => {
	test("attaches all expected components at PATH[0]", () => {
		const world = new World();
		const entity = spawnEnemy(world, "fast");
		expect(world.hasEntity(entity)).toBe(true);

		const first = PATH[0];
		if (!first) throw new Error("unreachable");
		const pos = world.getComponent<Position>(entity, C_POSITION);
		expect(pos?.x).toBeCloseTo(first.x, 6);
		expect(pos?.y).toBeCloseTo(first.y, 6);

		const vel = world.getComponent<Velocity>(entity, C_VELOCITY);
		expect(vel).toBeDefined();

		const pf = world.getComponent<PathFollow>(entity, C_PATH_FOLLOW);
		expect(pf?.distance).toBe(0);
		expect(pf?.speed).toBe(ENEMY_STATS.fast.speed);

		const health = world.getComponent<Health>(entity, C_HEALTH);
		expect(health).toEqual({ hp: ENEMY_STATS.fast.maxHp, max: ENEMY_STATS.fast.maxHp });

		const et = world.getComponent<EnemyType>(entity, C_ENEMY_TYPE);
		expect(et?.kind).toBe("fast");
		expect(et?.bounty).toBe(ENEMY_STATS.fast.bounty);
		expect(et?.leakDamage).toBe(ENEMY_STATS.fast.leakDamage);
	});

	test("heavy carries heavy stats", () => {
		const world = new World();
		const entity = spawnEnemy(world, "heavy");
		const pf = world.getComponent<PathFollow>(entity, C_PATH_FOLLOW);
		const et = world.getComponent<EnemyType>(entity, C_ENEMY_TYPE);
		expect(pf?.speed).toBe(ENEMY_STATS.heavy.speed);
		expect(et?.kind).toBe("heavy");
	});
});

describe("movementSystem", () => {
	test("advances PathFollow distance by speed * dt each tick", () => {
		const world = new World();
		const entity = spawnEnemy(world, "fast");
		movementSystem(world, 0.1);
		const pf = world.getComponent<PathFollow>(entity, C_PATH_FOLLOW);
		expect(pf?.distance).toBeCloseTo(ENEMY_STATS.fast.speed * 0.1, 6);
	});

	test("updates Position to match the current point on the polyline", () => {
		const world = new World();
		const entity = spawnEnemy(world, "heavy");
		movementSystem(world, 0.2);
		const pos = world.getComponent<Position>(entity, C_POSITION);
		const first = PATH[0];
		if (!first) throw new Error("unreachable");
		expect(pos?.x).not.toBeCloseTo(first.x, 2);
	});

	test("writes Velocity aligned with the path tangent and scaled by speed", () => {
		const world = new World();
		const entity = spawnEnemy(world, "fast");
		movementSystem(world, 0.05);
		const vel = world.getComponent<Velocity>(entity, C_VELOCITY);
		if (!vel) throw new Error("unreachable");
		const speed = Math.hypot(vel.dx, vel.dy);
		expect(speed).toBeCloseTo(ENEMY_STATS.fast.speed, 4);
	});

	test("fast enemy moves further than heavy in the same dt", () => {
		const world = new World();
		const fast = spawnEnemy(world, "fast");
		const heavy = spawnEnemy(world, "heavy");
		movementSystem(world, 0.5);
		const fastPf = world.getComponent<PathFollow>(fast, C_PATH_FOLLOW);
		const heavyPf = world.getComponent<PathFollow>(heavy, C_PATH_FOLLOW);
		expect(fastPf?.distance ?? 0).toBeGreaterThan(heavyPf?.distance ?? 0);
	});

	test("enemy reaching the exit is destroyed and deducts lives", () => {
		const world = new World();
		world.lives = 20;
		const entity = spawnEnemy(world, "heavy");
		const pf = world.getComponent<PathFollow>(entity, C_PATH_FOLLOW);
		if (!pf) throw new Error("unreachable");
		// Put the enemy one tick away from the exit at this speed.
		pf.distance = PATH_TOTAL_LENGTH - 1;
		movementSystem(world, 1);
		expect(world.hasEntity(entity)).toBe(false);
		expect(world.lives).toBe(20 - ENEMY_STATS.heavy.leakDamage);
	});

	test("leaking multiple enemies stacks the damage", () => {
		const world = new World();
		world.lives = 10;
		const e1 = spawnEnemy(world, "fast");
		const e2 = spawnEnemy(world, "fast");
		for (const e of [e1, e2]) {
			const pf = world.getComponent<PathFollow>(e, C_PATH_FOLLOW);
			if (!pf) throw new Error("unreachable");
			pf.distance = PATH_TOTAL_LENGTH + 1;
		}
		movementSystem(world, 0.001);
		expect(world.lives).toBe(10 - 2 * ENEMY_STATS.fast.leakDamage);
		expect(world.entityCount()).toBe(0);
	});
});

describe("renderEnemies", () => {
	test("draws a sprite and an HP bar for each enemy", () => {
		const world = new World();
		spawnEnemy(world, "fast");
		const { ctx, calls } = makeStubCtx();
		renderEnemies(ctx, world, new Map() as SpriteMap);
		// With no sprite image available, renderEnemies falls back to a
		// primitive circle (beginPath/arc/fill). An HP bar is composed of
		// several fillRect calls.
		expect(calls.arc).toBeGreaterThan(0);
		expect(calls.fillRect).toBeGreaterThanOrEqual(3);
	});

	test("HP bar width shrinks as hp drops", () => {
		const world = new World();
		const entity = spawnEnemy(world, "heavy");
		const health = world.getComponent<Health>(entity, C_HEALTH);
		if (!health) throw new Error("unreachable");
		health.hp = Math.floor(health.max / 4);

		const { ctx, rects } = makeStubCtx();
		renderEnemies(ctx, world, new Map() as SpriteMap);
		// Widths recorded for all fillRect calls. The HP bar fill (last
		// bar drawn) should be less than a full bar (34 px).
		const maxWidth = Math.max(...rects.map((r) => r.w));
		expect(maxWidth).toBeLessThanOrEqual(36);
		const fillWidths = rects.map((r) => r.w);
		// At 25% hp, the foreground fill is ~8.5 px (34 * 0.25).
		expect(fillWidths.some((w) => w > 0 && w < 15)).toBe(true);
	});
});

interface StubCounters {
	fillRect: number;
	arc: number;
	drawImage: number;
}

interface StubCtx {
	ctx: CanvasRenderingContext2D;
	calls: StubCounters;
	rects: Array<{ x: number; y: number; w: number; h: number }>;
}

function makeStubCtx(): StubCtx {
	const calls: StubCounters = { fillRect: 0, arc: 0, drawImage: 0 };
	const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
	const ctx = {
		fillStyle: "" as string | CanvasPattern,
		strokeStyle: "" as string | CanvasPattern,
		lineWidth: 0,
		save: () => {},
		restore: () => {},
		beginPath: () => {},
		arc: () => {
			calls.arc++;
		},
		fill: () => {},
		stroke: () => {},
		fillRect: (x: number, y: number, w: number, h: number) => {
			calls.fillRect++;
			rects.push({ x, y, w, h });
		},
		drawImage: () => {
			calls.drawImage++;
		},
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, rects };
}
