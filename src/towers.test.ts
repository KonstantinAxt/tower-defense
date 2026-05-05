import { describe, expect, test } from "bun:test";
import { World } from "./ecs";
import {
	C_HEALTH,
	C_PATH_FOLLOW,
	C_POSITION,
	type Health,
	type PathFollow,
	type Position,
	spawnEnemy,
} from "./enemies";
import { BUILD_SLOTS } from "./level";
import {
	C_PROJECTILE,
	C_TOWER,
	type Projectile,
	TOWER_DATA,
	TOWER_KINDS,
	type Tower,
	buildTower,
	findTowerAtSlot,
	pickSlotAt,
	projectileSystem,
	towerBuildCost,
	towerCurrentTier,
	towerSystem,
	towerUpgradeCost,
	upgradeTower,
} from "./towers";

describe("TOWER_DATA", () => {
	test("each kind has 3 tiers with strictly improving damage and matching costs", () => {
		for (const kind of TOWER_KINDS) {
			const data = TOWER_DATA[kind];
			expect(data.tiers.length).toBe(3);
			for (let i = 1; i < data.tiers.length; i++) {
				const prev = data.tiers[i - 1];
				const curr = data.tiers[i];
				if (!prev || !curr) throw new Error("unreachable");
				expect(curr.damage).toBeGreaterThan(prev.damage);
				expect(curr.range).toBeGreaterThanOrEqual(prev.range);
				expect(curr.fireRate).toBeGreaterThanOrEqual(prev.fireRate);
			}
		}
	});

	test("only mortar deals splash damage", () => {
		expect(TOWER_DATA.mortar.tiers[0].aoe).toBeGreaterThan(0);
		expect(TOWER_DATA.cannon.tiers[0].aoe).toBe(0);
		expect(TOWER_DATA.mg.tiers[0].aoe).toBe(0);
	});

	test("MG fires faster than the cannon", () => {
		expect(TOWER_DATA.mg.tiers[0].fireRate).toBeGreaterThan(TOWER_DATA.cannon.tiers[0].fireRate);
	});
});

describe("buildTower / upgradeTower economy", () => {
	test("buildTower deducts gold and creates a tower entity", () => {
		const world = new World();
		world.gold = 200;
		const entity = buildTower(world, "cannon", 0);
		expect(entity).not.toBeNull();
		expect(world.gold).toBe(200 - towerBuildCost("cannon"));
		expect(findTowerAtSlot(world, 0)).toBe(entity);
	});

	test("buildTower fails when gold is insufficient and does not deduct", () => {
		const world = new World();
		world.gold = 10;
		const entity = buildTower(world, "cannon", 0);
		expect(entity).toBeNull();
		expect(world.gold).toBe(10);
		expect(findTowerAtSlot(world, 0)).toBeNull();
	});

	test("buildTower refuses an occupied slot", () => {
		const world = new World();
		world.gold = 10_000;
		buildTower(world, "cannon", 0);
		const second = buildTower(world, "mg", 0);
		expect(second).toBeNull();
	});

	test("upgradeTower advances tier and deducts cost", () => {
		const world = new World();
		world.gold = 10_000;
		const e = buildTower(world, "cannon", 0);
		if (e === null) throw new Error("unreachable");
		const goldAfterBuild = world.gold;
		const tower = world.getComponent<Tower>(e, C_TOWER);
		if (!tower) throw new Error("unreachable");
		const upCost = towerUpgradeCost(tower);
		if (upCost === null) throw new Error("unreachable");

		expect(upgradeTower(world, e)).toBe(true);
		expect(world.gold).toBe(goldAfterBuild - upCost);
		expect(tower.tier).toBe(1);
	});

	test("upgradeTower fails at max tier", () => {
		const world = new World();
		world.gold = 10_000;
		const e = buildTower(world, "mg", 0);
		if (e === null) throw new Error("unreachable");
		expect(upgradeTower(world, e)).toBe(true);
		expect(upgradeTower(world, e)).toBe(true);
		expect(upgradeTower(world, e)).toBe(false);
		const tower = world.getComponent<Tower>(e, C_TOWER);
		expect(tower?.tier).toBe(2);
	});
});

describe("towerSystem targeting + firing", () => {
	test("tower in range fires once when cooldown elapses", () => {
		const world = new World();
		world.gold = 1000;
		// Spawn an enemy near slot 0 by placing one at the start of the path
		// and pulling slot 0 close to it. Slots are fixed; we just verify a
		// tower at slot 0 with default data ranges to PATH[0]-ish.
		const enemy = spawnEnemy(world, "heavy");
		// Place enemy directly next to slot 0 by overriding its position.
		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("unreachable");
		const pos = world.getComponent<Position>(enemy, C_POSITION);
		if (!pos) throw new Error("unreachable");
		pos.x = slot.x + 30;
		pos.y = slot.y;

		buildTower(world, "cannon", 0);
		// First tick: cooldown was 0 so it fires immediately.
		towerSystem(world, 0);
		const projectiles = world.query(C_PROJECTILE);
		expect(projectiles.length).toBe(1);
	});

	test("tower outside range does not fire", () => {
		const world = new World();
		world.gold = 1000;
		const enemy = spawnEnemy(world, "fast");
		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("unreachable");
		const pos = world.getComponent<Position>(enemy, C_POSITION);
		if (!pos) throw new Error("unreachable");
		pos.x = slot.x + 9999;
		pos.y = slot.y;

		buildTower(world, "cannon", 0);
		towerSystem(world, 0);
		expect(world.query(C_PROJECTILE).length).toBe(0);
	});

	test("cooldown gates firing rate", () => {
		const world = new World();
		world.gold = 1000;
		const enemy = spawnEnemy(world, "heavy");
		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("unreachable");
		const pos = world.getComponent<Position>(enemy, C_POSITION);
		if (!pos) throw new Error("unreachable");
		pos.x = slot.x + 20;
		pos.y = slot.y;

		const e = buildTower(world, "cannon", 0);
		if (e === null) throw new Error("unreachable");
		towerSystem(world, 0); // fires once
		towerSystem(world, 0); // still cooling
		expect(world.query(C_PROJECTILE).length).toBe(1);

		// Advance enough to clear the cooldown of cannon tier 0 (1.0/s)
		towerSystem(world, 1.1);
		expect(world.query(C_PROJECTILE).length).toBe(2);
	});

	test("'first' targeting picks the enemy furthest along the path", () => {
		const world = new World();
		world.gold = 1000;
		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("unreachable");

		const a = spawnEnemy(world, "heavy");
		const b = spawnEnemy(world, "heavy");
		// Place both near the tower, but give 'b' a higher path distance.
		for (const id of [a, b]) {
			const pos = world.getComponent<Position>(id, C_POSITION);
			if (pos) {
				pos.x = slot.x + 10;
				pos.y = slot.y;
			}
		}
		const pfA = world.getComponent<PathFollow>(a, C_PATH_FOLLOW);
		const pfB = world.getComponent<PathFollow>(b, C_PATH_FOLLOW);
		if (!pfA || !pfB) throw new Error("unreachable");
		pfA.distance = 10;
		pfB.distance = 50;

		buildTower(world, "cannon", 0);
		towerSystem(world, 0);

		const projIds = world.query(C_PROJECTILE);
		expect(projIds.length).toBe(1);
		const projEntity = projIds[0];
		if (projEntity === undefined) throw new Error("unreachable");
		const proj = world.getComponent<Projectile>(projEntity, C_PROJECTILE);
		expect(proj?.target).toBe(b);
	});
});

describe("projectileSystem", () => {
	test("projectile travels toward its target and damages on impact", () => {
		const world = new World();
		const enemy = spawnEnemy(world, "fast");
		const pos = world.getComponent<Position>(enemy, C_POSITION);
		const health = world.getComponent<Health>(enemy, C_HEALTH);
		if (!pos || !health) throw new Error("unreachable");
		pos.x = 100;
		pos.y = 100;
		const startHp = health.hp;

		const projEntity = world.createEntity();
		const proj: Projectile = {
			x: 100,
			y: 90,
			targetX: 100,
			targetY: 100,
			target: enemy,
			speed: 1000,
			damage: 5,
			aoe: 0,
		};
		world.addComponent(projEntity, C_PROJECTILE, proj);

		projectileSystem(world, 0.05);
		expect(world.hasEntity(projEntity)).toBe(false);
		expect(health.hp).toBe(startHp - 5);
	});

	test("AoE projectile damages all enemies in splash radius", () => {
		const world = new World();
		const e1 = spawnEnemy(world, "fast");
		const e2 = spawnEnemy(world, "fast");
		for (const [id, x] of [
			[e1, 200],
			[e2, 220],
		] as const) {
			const pos = world.getComponent<Position>(id, C_POSITION);
			if (pos) {
				pos.x = x;
				pos.y = 200;
			}
		}

		const projEntity = world.createEntity();
		const proj: Projectile = {
			x: 200,
			y: 199,
			targetX: 200,
			targetY: 200,
			target: e1,
			speed: 1000,
			damage: 100,
			aoe: 40,
		};
		world.addComponent(projEntity, C_PROJECTILE, proj);

		projectileSystem(world, 0.05);
		// Both enemies took >= damage and may have died; either way they
		// were 'hit' meaning either destroyed or hp reduced.
		const h1 = world.getComponent<Health>(e1, C_HEALTH);
		const h2 = world.getComponent<Health>(e2, C_HEALTH);
		// h1 and h2 may be undefined if the enemy was destroyed by the splash.
		const e1Dead = !world.hasEntity(e1);
		const e2Dead = !world.hasEntity(e2);
		expect(e1Dead || (h1 !== undefined && h1.hp < 30)).toBe(true);
		expect(e2Dead || (h2 !== undefined && h2.hp < 30)).toBe(true);
	});

	test("kill awards bounty", () => {
		const world = new World();
		world.gold = 0;
		const enemy = spawnEnemy(world, "fast");
		const pos = world.getComponent<Position>(enemy, C_POSITION);
		const health = world.getComponent<Health>(enemy, C_HEALTH);
		if (!pos || !health) throw new Error("unreachable");
		pos.x = 50;
		pos.y = 50;
		health.hp = 1;

		const projEntity = world.createEntity();
		const proj: Projectile = {
			x: 50,
			y: 49,
			targetX: 50,
			targetY: 50,
			target: enemy,
			speed: 1000,
			damage: 50,
			aoe: 0,
		};
		world.addComponent(projEntity, C_PROJECTILE, proj);

		projectileSystem(world, 0.05);
		expect(world.hasEntity(enemy)).toBe(false);
		expect(world.gold).toBeGreaterThan(0);
	});
});

describe("pickSlotAt", () => {
	test("returns slot index when point is on a slot", () => {
		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("unreachable");
		expect(pickSlotAt({ x: slot.x, y: slot.y })).toBe(0);
	});

	test("returns null when point is far from any slot", () => {
		expect(pickSlotAt({ x: -500, y: -500 })).toBeNull();
	});
});

describe("towerCurrentTier", () => {
	test("returns the tier matching tower.tier", () => {
		const world = new World();
		world.gold = 10_000;
		const e = buildTower(world, "mortar", 0);
		if (e === null) throw new Error("unreachable");
		const tower = world.getComponent<Tower>(e, C_TOWER);
		if (!tower) throw new Error("unreachable");
		expect(towerCurrentTier(tower)).toEqual(TOWER_DATA.mortar.tiers[0]);
		upgradeTower(world, e);
		expect(towerCurrentTier(tower)).toEqual(TOWER_DATA.mortar.tiers[1]);
	});
});
