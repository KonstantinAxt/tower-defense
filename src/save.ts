import type { World } from "./ecs";
import { BUILD_SLOTS } from "./level";
import { C_TOWER, TOWER_KINDS, type Tower, type TowerKind } from "./towers";
import type { WaveController } from "./waves";
import { TOTAL_WAVES } from "./waves";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "tower-defense:save:v1";

export interface TowerSnapshot {
	kind: TowerKind;
	tier: number;
	slotIndex: number;
}

export interface SaveSnapshot {
	version: number;
	gold: number;
	lives: number;
	wave: number;
	currentWave: number;
	towers: TowerSnapshot[];
}

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export function serialize(world: World, controller: WaveController): SaveSnapshot {
	const towers: TowerSnapshot[] = [];
	for (const entity of world.query(C_TOWER)) {
		const tower = world.getComponent<Tower>(entity, C_TOWER);
		if (!tower) continue;
		towers.push({
			kind: tower.kind,
			tier: tower.tier,
			slotIndex: tower.slotIndex,
		});
	}
	towers.sort((a, b) => a.slotIndex - b.slotIndex);
	return {
		version: SAVE_VERSION,
		gold: world.gold,
		lives: world.lives,
		wave: world.wave,
		currentWave: controller.currentWave,
		towers,
	};
}

export function deserialize(
	world: World,
	controller: WaveController,
	snapshot: SaveSnapshot,
): void {
	if (snapshot.version !== SAVE_VERSION) {
		throw new Error(`save: unsupported version ${snapshot.version}`);
	}
	world.reset();
	world.lives = snapshot.lives;
	world.gold = snapshot.gold;
	world.wave = snapshot.wave;

	const taken = new Set<number>();
	for (const t of snapshot.towers) {
		if (!TOWER_KINDS.includes(t.kind)) continue;
		const slot = BUILD_SLOTS[t.slotIndex];
		if (!slot) continue;
		if (taken.has(t.slotIndex)) continue;
		taken.add(t.slotIndex);
		const entity = world.createEntity();
		const tower: Tower = {
			kind: t.kind,
			tier: Math.max(0, Math.min(2, Math.floor(t.tier))),
			slotIndex: t.slotIndex,
			x: slot.x,
			y: slot.y,
			cooldown: 0,
		};
		world.addComponent(entity, C_TOWER, tower);
	}

	controller.restart();
	const targetWave = Math.max(1, Math.min(TOTAL_WAVES, Math.floor(snapshot.currentWave)));
	controller.currentWave = targetWave;
}

export function saveToStorage(snapshot: SaveSnapshot, storage: StorageLike): void {
	storage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

export function loadFromStorage(storage: StorageLike): SaveSnapshot | null {
	const raw = storage.getItem(SAVE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as SaveSnapshot;
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.version !== SAVE_VERSION) return null;
		if (!Array.isArray(parsed.towers)) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function clearStorage(storage: StorageLike): void {
	storage.removeItem(SAVE_KEY);
}
