import type { Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// 3D model keys mirror the 2D SpriteKey set; the renderer maps each one to a
// piece of game state (enemy kind, tower kind, projectile, path/build tile).
export type ModelKey =
	| "tile_grass"
	| "tile_path"
	| "tile_slot"
	| "tower_cannon"
	| "tower_mg"
	| "tower_mortar"
	| "enemy_fast"
	| "enemy_heavy"
	| "projectile";

interface ManifestEntry {
	readonly key: ModelKey;
	readonly src: string;
}

const KENNEY3D_BASE = "/assets/kenney3d";

// Filenames mirror the 2D loader's keys 1:1. The pack is pre-seeded by a
// human under `assets/kenney3d/`. Missing files fall back to neutral
// primitives in the renderer, so the game is still playable.
export const MODEL_MANIFEST: readonly ManifestEntry[] = [
	{ key: "tile_grass", src: `${KENNEY3D_BASE}/tile_grass.glb` },
	{ key: "tile_path", src: `${KENNEY3D_BASE}/tile_path.glb` },
	{ key: "tile_slot", src: `${KENNEY3D_BASE}/tile_slot.glb` },
	{ key: "tower_cannon", src: `${KENNEY3D_BASE}/tower_cannon.glb` },
	{ key: "tower_mg", src: `${KENNEY3D_BASE}/tower_mg.glb` },
	{ key: "tower_mortar", src: `${KENNEY3D_BASE}/tower_mortar.glb` },
	{ key: "enemy_fast", src: `${KENNEY3D_BASE}/enemy_fast.glb` },
	{ key: "enemy_heavy", src: `${KENNEY3D_BASE}/enemy_heavy.glb` },
	{ key: "projectile", src: `${KENNEY3D_BASE}/projectile.glb` },
];

export type ModelMap = ReadonlyMap<ModelKey, Object3D | null>;

// Subset of `fetch` we actually need — accepts the broader options bag without
// requiring the host's exact `typeof fetch` signature (varies by Bun/Node).
export type FetchLike = (input: string, init?: { method?: string }) => Promise<{ ok: boolean }>;

interface LoadModelsOptions {
	readonly loader?: GLTFLoader;
	readonly fetchFn?: FetchLike;
}

async function loadOne(
	loader: GLTFLoader,
	src: string,
	fetchFn: FetchLike,
): Promise<Object3D | null> {
	// Probe with HEAD first so a 404 doesn't surface as a noisy parse error.
	try {
		const probe = await fetchFn(src, { method: "HEAD" });
		if (!probe.ok) return null;
	} catch {
		return null;
	}
	try {
		const gltf = await loader.loadAsync(src);
		return gltf.scene;
	} catch {
		return null;
	}
}

// Resolves once every model has either loaded or failed. Failures come back
// as null so the renderer can fall back to neutral primitives — useful when
// the Kenney 3D pack hasn't been downloaded yet. A single console warning
// surfaces a missing/empty `assets/kenney3d/` so the dev knows why.
export async function loadModels(opts: LoadModelsOptions = {}): Promise<ModelMap> {
	const loader = opts.loader ?? new GLTFLoader();
	const fetchFn: FetchLike = opts.fetchFn ?? ((input, init) => fetch(input, init));
	const entries = await Promise.all(
		MODEL_MANIFEST.map(async ({ key, src }) => [key, await loadOne(loader, src, fetchFn)] as const),
	);
	const map = new Map(entries);
	const loaded = entries.filter(([, v]) => v !== null).length;
	if (loaded === 0) {
		console.warn(
			`[loader3d] no models found under ${KENNEY3D_BASE}/ — falling back to neutral primitives`,
		);
	}
	return map;
}
