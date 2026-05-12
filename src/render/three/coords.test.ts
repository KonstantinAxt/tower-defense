import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";
import { BUILD_SLOTS, CANVAS_HEIGHT, CANVAS_WIDTH } from "../../level";
import { gameFromWorldHit, worldFromGameCoord } from "./coords";

describe("coords", () => {
	test("worldFromGameCoord places point on the y=0 plane", () => {
		const v = worldFromGameCoord({ x: 12, y: 34 });
		expect(v.x).toBe(12);
		expect(v.y).toBe(0);
		expect(v.z).toBe(34);
	});

	test("gameFromWorldHit reads x and z, ignores y", () => {
		const p = gameFromWorldHit(new Vector3(7, 99, 11));
		expect(p.x).toBe(7);
		expect(p.y).toBe(11);
	});

	test("round-trip preserves arbitrary game points", () => {
		const samples = [
			{ x: 0, y: 0 },
			{ x: 1, y: -1 },
			{ x: -250.5, y: 482.25 },
			{ x: CANVAS_WIDTH, y: CANVAS_HEIGHT },
		];
		for (const p of samples) {
			const v = worldFromGameCoord(p);
			const back = gameFromWorldHit(v);
			expect(back.x).toBe(p.x);
			expect(back.y).toBe(p.y);
		}
	});

	test("round-trip preserves all build slots", () => {
		for (const slot of BUILD_SLOTS) {
			const back = gameFromWorldHit(worldFromGameCoord(slot));
			expect(back.x).toBe(slot.x);
			expect(back.y).toBe(slot.y);
		}
	});

	test("round-trip handles edge values (zero, negatives, large)", () => {
		const edges = [
			{ x: 0, y: 0 },
			{ x: -1e6, y: 1e6 },
			{ x: Number.MIN_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER },
		];
		for (const p of edges) {
			const back = gameFromWorldHit(worldFromGameCoord(p));
			expect(back.x).toBe(p.x);
			expect(back.y).toBe(p.y);
		}
	});
});
