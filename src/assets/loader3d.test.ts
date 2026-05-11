import { describe, expect, test } from "bun:test";
import { type FetchLike, MODEL_MANIFEST, type ModelKey, loadModels } from "./loader3d";

describe("MODEL_MANIFEST", () => {
	test("covers every ModelKey expected by the renderer", () => {
		const expected: readonly ModelKey[] = [
			"tile_grass",
			"tile_path",
			"tile_slot",
			"tower_cannon",
			"tower_mg",
			"tower_mortar",
			"enemy_fast",
			"enemy_heavy",
			"projectile",
		];
		const keys = MODEL_MANIFEST.map((m) => m.key).sort();
		expect(keys).toEqual([...expected].sort());
	});

	test("each entry points under /assets/kenney3d/", () => {
		for (const m of MODEL_MANIFEST) {
			expect(m.src.startsWith("/assets/kenney3d/")).toBe(true);
			expect(m.src.endsWith(".glb")).toBe(true);
		}
	});
});

describe("loadModels", () => {
	test("returns null entries when fetch HEAD probes 404", async () => {
		const fetchFn: FetchLike = async () => ({ ok: false });
		const originalWarn = console.warn;
		const warnings: string[] = [];
		console.warn = (msg: string) => {
			warnings.push(msg);
		};
		try {
			const map = await loadModels({ fetchFn });
			for (const m of MODEL_MANIFEST) {
				expect(map.get(m.key)).toBeNull();
			}
			expect(warnings.length).toBe(1);
			expect(warnings[0]).toContain("/assets/kenney3d");
		} finally {
			console.warn = originalWarn;
		}
	});

	test("returns null entries when fetch throws", async () => {
		const fetchFn: FetchLike = async () => {
			throw new Error("network down");
		};
		const originalWarn = console.warn;
		console.warn = () => {};
		try {
			const map = await loadModels({ fetchFn });
			for (const m of MODEL_MANIFEST) {
				expect(map.get(m.key)).toBeNull();
			}
		} finally {
			console.warn = originalWarn;
		}
	});
});
