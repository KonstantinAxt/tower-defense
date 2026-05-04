import { describe, expect, test } from "bun:test";
import { World } from "./world";

interface Position {
	x: number;
	y: number;
}
interface Velocity {
	dx: number;
	dy: number;
}

describe("World — entities", () => {
	test("createEntity yields unique, live IDs", () => {
		const w = new World();
		const a = w.createEntity();
		const b = w.createEntity();
		expect(a).not.toBe(b);
		expect(w.hasEntity(a)).toBe(true);
		expect(w.hasEntity(b)).toBe(true);
		expect(w.entityCount()).toBe(2);
	});

	test("destroyEntity removes the entity and all its components", () => {
		const w = new World();
		const e = w.createEntity();
		w.addComponent<Position>(e, "Position", { x: 1, y: 2 });
		w.destroyEntity(e);
		expect(w.hasEntity(e)).toBe(false);
		expect(w.getComponent<Position>(e, "Position")).toBeUndefined();
		expect(w.entityCount()).toBe(0);
	});

	test("destroyEntity on unknown entity is a no-op", () => {
		const w = new World();
		expect(() => w.destroyEntity(999)).not.toThrow();
	});
});

describe("World — components", () => {
	test("add/get/has round-trip", () => {
		const w = new World();
		const e = w.createEntity();
		w.addComponent<Position>(e, "Position", { x: 3, y: 4 });
		expect(w.hasComponent(e, "Position")).toBe(true);
		expect(w.getComponent<Position>(e, "Position")).toEqual({ x: 3, y: 4 });
	});

	test("addComponent on destroyed entity throws", () => {
		const w = new World();
		const e = w.createEntity();
		w.destroyEntity(e);
		expect(() => w.addComponent<Position>(e, "Position", { x: 0, y: 0 })).toThrow();
	});

	test("removeComponent returns true when present, false otherwise", () => {
		const w = new World();
		const e = w.createEntity();
		w.addComponent<Position>(e, "Position", { x: 0, y: 0 });
		expect(w.removeComponent(e, "Position")).toBe(true);
		expect(w.hasComponent(e, "Position")).toBe(false);
		expect(w.removeComponent(e, "Position")).toBe(false);
		expect(w.removeComponent(e, "Missing")).toBe(false);
	});

	test("addComponent on same type overwrites", () => {
		const w = new World();
		const e = w.createEntity();
		w.addComponent<Position>(e, "Position", { x: 1, y: 1 });
		w.addComponent<Position>(e, "Position", { x: 9, y: 9 });
		expect(w.getComponent<Position>(e, "Position")).toEqual({ x: 9, y: 9 });
	});
});

describe("World — query", () => {
	test("returns entities with all requested components", () => {
		const w = new World();
		const a = w.createEntity();
		const b = w.createEntity();
		const c = w.createEntity();
		w.addComponent<Position>(a, "Position", { x: 0, y: 0 });
		w.addComponent<Velocity>(a, "Velocity", { dx: 1, dy: 0 });
		w.addComponent<Position>(b, "Position", { x: 1, y: 1 });
		w.addComponent<Velocity>(c, "Velocity", { dx: 0, dy: 1 });

		const moving = w.query("Position", "Velocity");
		expect(moving).toEqual([a]);
	});

	test("returns empty when a requested type has no entities", () => {
		const w = new World();
		const e = w.createEntity();
		w.addComponent<Position>(e, "Position", { x: 0, y: 0 });
		expect(w.query("Position", "Missing")).toEqual([]);
	});

	test("no types returns every alive entity", () => {
		const w = new World();
		const a = w.createEntity();
		const b = w.createEntity();
		expect(w.query().sort()).toEqual([a, b].sort());
	});
});
