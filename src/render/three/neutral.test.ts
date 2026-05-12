import { describe, expect, test } from "bun:test";
import { Scene } from "three";
import type { ModelMap } from "../../assets/loader3d";
import { World } from "../../ecs";
import { spawnEnemy } from "../../enemies";
import { BUILD_SLOTS } from "../../level";
import { C_PROJECTILE, type Projectile, buildTower } from "../../towers";
import { MODEL_HEIGHT, createNeutralRenderer } from "./neutral";

const EMPTY_MODELS: ModelMap = new Map();

function findGroup(scene: Scene): { dynamic: Scene | null } {
	let dynamic: Scene | null = null;
	scene.traverse((obj) => {
		if (obj.name === "dynamic") dynamic = obj as unknown as Scene;
	});
	return { dynamic };
}

describe("createNeutralRenderer", () => {
	test("attaches a neutral-renderer group with static path + slot meshes", () => {
		const scene = new Scene();
		const renderer = createNeutralRenderer(scene, EMPTY_MODELS);
		let foundRoot = false;
		let foundPath = false;
		scene.traverse((obj) => {
			if (obj.name === "neutral-renderer") foundRoot = true;
			if (obj.name === "path") foundPath = true;
		});
		expect(foundRoot).toBe(true);
		expect(foundPath).toBe(true);
		renderer.dispose();
	});

	test("adds, updates, and removes enemy meshes as the world changes", () => {
		const scene = new Scene();
		const world = new World();
		world.lives = 20;
		const renderer = createNeutralRenderer(scene, EMPTY_MODELS);

		const fast = spawnEnemy(world, "fast");
		renderer.update(world);
		const dynamic = findGroup(scene).dynamic;
		expect(dynamic).not.toBeNull();
		if (!dynamic) throw new Error("dynamic group missing");
		expect(dynamic.children.length).toBe(1);
		const enemyMesh = dynamic.children[0];
		expect(enemyMesh?.position.y).toBeCloseTo(MODEL_HEIGHT.enemy_fast, 6);

		world.destroyEntity(fast);
		renderer.update(world);
		expect(dynamic.children.length).toBe(0);
		renderer.dispose();
	});

	test("places tower meshes at the slot's modelHeight", () => {
		const scene = new Scene();
		const world = new World();
		world.gold = 10000;
		const renderer = createNeutralRenderer(scene, EMPTY_MODELS);

		const slot = BUILD_SLOTS[0];
		if (!slot) throw new Error("no build slot");
		buildTower(world, "cannon", 0);
		renderer.update(world);
		const dynamic = findGroup(scene).dynamic;
		if (!dynamic) throw new Error("dynamic group missing");
		const towerMesh = dynamic.children[0];
		expect(towerMesh?.position.x).toBeCloseTo(slot.x, 6);
		expect(towerMesh?.position.z).toBeCloseTo(slot.y, 6);
		expect(towerMesh?.position.y).toBeCloseTo(MODEL_HEIGHT.tower_cannon, 6);
		renderer.dispose();
	});

	test("syncs projectile meshes from the world", () => {
		const scene = new Scene();
		const world = new World();
		const renderer = createNeutralRenderer(scene, EMPTY_MODELS);

		const e = world.createEntity();
		const proj: Projectile = {
			x: 100,
			y: 200,
			targetX: 100,
			targetY: 200,
			target: 0,
			speed: 100,
			damage: 1,
			aoe: 0,
		};
		world.addComponent(e, C_PROJECTILE, proj);
		renderer.update(world);
		const dynamic = findGroup(scene).dynamic;
		if (!dynamic) throw new Error("dynamic group missing");
		expect(dynamic.children.length).toBe(1);
		const mesh = dynamic.children[0];
		expect(mesh?.position.y).toBeCloseTo(MODEL_HEIGHT.projectile, 6);
		expect(mesh?.position.x).toBeCloseTo(100, 6);
		expect(mesh?.position.z).toBeCloseTo(200, 6);

		world.destroyEntity(e);
		renderer.update(world);
		expect(dynamic.children.length).toBe(0);
		renderer.dispose();
	});

	test("dispose removes the renderer root from the scene", () => {
		const scene = new Scene();
		const renderer = createNeutralRenderer(scene, EMPTY_MODELS);
		renderer.dispose();
		let stillThere = false;
		scene.traverse((obj) => {
			if (obj.name === "neutral-renderer") stillThere = true;
		});
		expect(stillThere).toBe(false);
	});
});
