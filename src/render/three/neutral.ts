import {
	BoxGeometry,
	CylinderGeometry,
	Group,
	Mesh,
	MeshStandardMaterial,
	type Object3D,
	type Scene,
	SphereGeometry,
} from "three";
import type { ModelKey, ModelMap } from "../../assets/loader3d";
import type { Entity, World } from "../../ecs";
import { C_ENEMY_TYPE, C_HEALTH, C_POSITION, type EnemyType, type Position } from "../../enemies";
import { BUILD_SLOTS, BUILD_SLOT_RADIUS, PATH, PATH_WIDTH } from "../../level";
import { C_PROJECTILE, C_TOWER, type Projectile, type Tower } from "../../towers";

// Y position of each model's origin above the ground plane (y=0). Sized so
// the neutral primitives sit clearly on top of the path/ground without
// floating; the renderer also passes this value to GLB instances so loaded
// meshes share the same vertical anchor.
export const MODEL_HEIGHT: Readonly<Record<ModelKey, number>> = {
	tile_grass: 0,
	tile_path: 0.1,
	tile_slot: 0.2,
	tower_cannon: 14,
	tower_mg: 12,
	tower_mortar: 14,
	enemy_fast: 9,
	enemy_heavy: 12,
	projectile: 6,
};

const NEUTRAL_COLORS = {
	enemy_fast: 0xc24646,
	enemy_heavy: 0x8a6a4a,
	tower_cannon: 0x6a7a9a,
	tower_mg: 0x4a8a4a,
	tower_mortar: 0x9a5a4a,
	projectile: 0xdcdcdc,
	path: 0x4a3f30,
	slot: 0x6a6a6a,
} as const;

export interface NeutralRenderer {
	update(world: World): void;
	dispose(): void;
}

interface InstanceCache {
	readonly enemies: Map<Entity, Object3D>;
	readonly towers: Map<Entity, Object3D>;
	readonly projectiles: Map<Entity, Object3D>;
}

// Adapter that mirrors ECS state into Three.js by adding/updating/removing
// `Object3D` instances on the scene each tick. When `models` provides a GLB
// for a key, a clone of it is used; otherwise neutral primitives stand in.
export function createNeutralRenderer(scene: Scene, models: ModelMap): NeutralRenderer {
	const root = new Group();
	root.name = "neutral-renderer";
	scene.add(root);

	const staticGroup = new Group();
	staticGroup.name = "static";
	root.add(staticGroup);
	staticGroup.add(buildPathMesh());
	for (const slot of BUILD_SLOTS) {
		const slotMesh = buildSlotMesh();
		slotMesh.position.set(slot.x, MODEL_HEIGHT.tile_slot, slot.y);
		staticGroup.add(slotMesh);
	}

	const dynamicGroup = new Group();
	dynamicGroup.name = "dynamic";
	root.add(dynamicGroup);

	const cache: InstanceCache = {
		enemies: new Map(),
		towers: new Map(),
		projectiles: new Map(),
	};

	function makeInstance(key: ModelKey): Object3D {
		const tpl = models.get(key);
		if (tpl) return tpl.clone(true);
		return makePrimitive(key);
	}

	function syncEnemies(world: World): void {
		const live = new Set<Entity>();
		for (const e of world.query(C_POSITION, C_ENEMY_TYPE, C_HEALTH)) {
			const pos = world.getComponent<Position>(e, C_POSITION);
			const et = world.getComponent<EnemyType>(e, C_ENEMY_TYPE);
			if (!pos || !et) continue;
			live.add(e);
			const key: ModelKey = et.kind === "fast" ? "enemy_fast" : "enemy_heavy";
			let mesh = cache.enemies.get(e);
			if (!mesh) {
				mesh = makeInstance(key);
				cache.enemies.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(pos.x, MODEL_HEIGHT[key], pos.y);
		}
		evictDead(cache.enemies, live, dynamicGroup);
	}

	function syncTowers(world: World): void {
		const live = new Set<Entity>();
		for (const e of world.query(C_TOWER)) {
			const tower = world.getComponent<Tower>(e, C_TOWER);
			if (!tower) continue;
			live.add(e);
			let mesh = cache.towers.get(e);
			const key: ModelKey =
				tower.kind === "cannon"
					? "tower_cannon"
					: tower.kind === "mg"
						? "tower_mg"
						: "tower_mortar";
			if (!mesh) {
				mesh = makeInstance(key);
				cache.towers.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(tower.x, MODEL_HEIGHT[key], tower.y);
		}
		evictDead(cache.towers, live, dynamicGroup);
	}

	function syncProjectiles(world: World): void {
		const live = new Set<Entity>();
		for (const e of world.query(C_PROJECTILE)) {
			const proj = world.getComponent<Projectile>(e, C_PROJECTILE);
			if (!proj) continue;
			live.add(e);
			let mesh = cache.projectiles.get(e);
			if (!mesh) {
				mesh = makeInstance("projectile");
				cache.projectiles.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(proj.x, MODEL_HEIGHT.projectile, proj.y);
		}
		evictDead(cache.projectiles, live, dynamicGroup);
	}

	return {
		update(world: World): void {
			syncEnemies(world);
			syncTowers(world);
			syncProjectiles(world);
		},
		dispose(): void {
			scene.remove(root);
			cache.enemies.clear();
			cache.towers.clear();
			cache.projectiles.clear();
		},
	};
}

function evictDead(map: Map<Entity, Object3D>, live: Set<Entity>, parent: Group): void {
	for (const [entity, mesh] of map) {
		if (!live.has(entity)) {
			parent.remove(mesh);
			map.delete(entity);
		}
	}
}

function makePrimitive(key: ModelKey): Object3D {
	switch (key) {
		case "enemy_fast": {
			const geo = new SphereGeometry(8, 12, 8);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.enemy_fast });
			return new Mesh(geo, mat);
		}
		case "enemy_heavy": {
			const geo = new BoxGeometry(20, 20, 20);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.enemy_heavy });
			return new Mesh(geo, mat);
		}
		case "tower_cannon": {
			const geo = new BoxGeometry(28, 26, 28);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.tower_cannon });
			return new Mesh(geo, mat);
		}
		case "tower_mg": {
			const geo = new CylinderGeometry(14, 14, 24, 12);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.tower_mg });
			return new Mesh(geo, mat);
		}
		case "tower_mortar": {
			const geo = new CylinderGeometry(16, 16, 26, 8);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.tower_mortar });
			return new Mesh(geo, mat);
		}
		case "projectile": {
			const geo = new SphereGeometry(3, 8, 6);
			const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.projectile });
			return new Mesh(geo, mat);
		}
		default: {
			const geo = new BoxGeometry(8, 8, 8);
			const mat = new MeshStandardMaterial({ color: 0x888888 });
			return new Mesh(geo, mat);
		}
	}
}

function buildPathMesh(): Object3D {
	const group = new Group();
	group.name = "path";
	const material = new MeshStandardMaterial({ color: NEUTRAL_COLORS.path });
	for (let i = 1; i < PATH.length; i++) {
		const a = PATH[i - 1];
		const b = PATH[i];
		if (!a || !b) continue;
		const dx = b.x - a.x;
		const dz = b.y - a.y;
		const len = Math.hypot(dx, dz);
		if (len === 0) continue;
		const geo = new BoxGeometry(len, 0.4, PATH_WIDTH);
		const mesh = new Mesh(geo, material);
		mesh.position.set((a.x + b.x) / 2, 0.2, (a.y + b.y) / 2);
		mesh.rotation.y = -Math.atan2(dz, dx);
		group.add(mesh);
	}
	return group;
}

function buildSlotMesh(): Object3D {
	const geo = new CylinderGeometry(BUILD_SLOT_RADIUS, BUILD_SLOT_RADIUS, 0.4, 16);
	const mat = new MeshStandardMaterial({ color: NEUTRAL_COLORS.slot });
	return new Mesh(geo, mat);
}
