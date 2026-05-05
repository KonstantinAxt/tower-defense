import { describe, expect, test } from "bun:test";
import { World } from "./ecs";
import {
	SAVE_KEY,
	SAVE_VERSION,
	type SaveSnapshot,
	type StorageLike,
	clearStorage,
	deserialize,
	loadFromStorage,
	saveToStorage,
	serialize,
} from "./save";
import { C_TOWER, type Tower, buildTower, upgradeTower } from "./towers";
import { TOTAL_WAVES, WaveController } from "./waves";

class MemoryStorage implements StorageLike {
	private readonly map = new Map<string, string>();
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	size(): number {
		return this.map.size;
	}
}

function setupWorld(): { world: World; controller: WaveController } {
	const world = new World();
	world.gold = 10_000;

	const cannon = buildTower(world, "cannon", 0);
	if (cannon === null) throw new Error("unreachable");
	upgradeTower(world, cannon);

	const mortar = buildTower(world, "mortar", 3);
	if (mortar === null) throw new Error("unreachable");
	upgradeTower(world, mortar);
	upgradeTower(world, mortar);

	buildTower(world, "mg", 5);

	world.gold = 333;
	world.lives = 17;
	world.wave = 4;

	const controller = new WaveController();
	controller.currentWave = 5;
	return { world, controller };
}

describe("save serialize/deserialize", () => {
	test("round-trips world and controller losslessly", () => {
		const { world, controller } = setupWorld();
		const snap = serialize(world, controller);

		const w2 = new World();
		const c2 = new WaveController();
		deserialize(w2, c2, snap);

		const snap2 = serialize(w2, c2);
		expect(snap2).toEqual(snap);

		expect(w2.gold).toBe(world.gold);
		expect(w2.lives).toBe(world.lives);
		expect(w2.wave).toBe(world.wave);
		expect(c2.currentWave).toBe(controller.currentWave);
		expect(c2.state).toBe("idle");

		const towers2 = w2.query(C_TOWER);
		expect(towers2.length).toBe(3);
		const byKind = new Map<string, Tower>();
		for (const e of towers2) {
			const t = w2.getComponent<Tower>(e, C_TOWER);
			if (t) byKind.set(t.kind, t);
		}
		expect(byKind.get("cannon")?.tier).toBe(1);
		expect(byKind.get("mortar")?.tier).toBe(2);
		expect(byKind.get("mg")?.tier).toBe(0);
	});

	test("snapshot uses the declared version", () => {
		const { world, controller } = setupWorld();
		const snap = serialize(world, controller);
		expect(snap.version).toBe(SAVE_VERSION);
	});

	test("deserialize rejects unknown version", () => {
		const { world, controller } = setupWorld();
		const snap = serialize(world, controller);
		const bad: SaveSnapshot = { ...snap, version: snap.version + 1 };
		expect(() => deserialize(new World(), new WaveController(), bad)).toThrow();
	});

	test("deserialize clamps currentWave into [1, TOTAL_WAVES]", () => {
		const { world, controller } = setupWorld();
		const snap = serialize(world, controller);
		const w2 = new World();
		const c2 = new WaveController();
		deserialize(w2, c2, { ...snap, currentWave: TOTAL_WAVES + 99 });
		expect(c2.currentWave).toBe(TOTAL_WAVES);
		deserialize(w2, c2, { ...snap, currentWave: 0 });
		expect(c2.currentWave).toBe(1);
	});
});

describe("save storage helpers", () => {
	test("save then load returns equal snapshot", () => {
		const storage = new MemoryStorage();
		const { world, controller } = setupWorld();
		const snap = serialize(world, controller);
		saveToStorage(snap, storage);
		const loaded = loadFromStorage(storage);
		expect(loaded).toEqual(snap);
	});

	test("loadFromStorage returns null when nothing saved", () => {
		const storage = new MemoryStorage();
		expect(loadFromStorage(storage)).toBeNull();
	});

	test("loadFromStorage returns null on garbage data", () => {
		const storage = new MemoryStorage();
		storage.setItem(SAVE_KEY, "{not json");
		expect(loadFromStorage(storage)).toBeNull();
	});

	test("loadFromStorage returns null on version mismatch", () => {
		const storage = new MemoryStorage();
		storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, towers: [] }));
		expect(loadFromStorage(storage)).toBeNull();
	});

	test("clearStorage removes the key", () => {
		const storage = new MemoryStorage();
		const { world, controller } = setupWorld();
		saveToStorage(serialize(world, controller), storage);
		clearStorage(storage);
		expect(loadFromStorage(storage)).toBeNull();
	});
});

describe("auto-save on wave clear", () => {
	test("WaveController.onCleared fires with the wave that just cleared", () => {
		const fired: number[] = [];
		const world = new World();
		world.lives = 20;
		const c = new WaveController(() => 0);
		c.onCleared = (n) => fired.push(n);
		c.startWave(world);
		c.update(world, 1000);
		c.update(world, 0.016);
		expect(fired).toEqual([1]);
		expect(c.currentWave).toBe(2);
		expect(c.state).toBe("idle");
	});
});
