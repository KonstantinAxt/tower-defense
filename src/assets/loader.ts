export type SpriteKey =
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
	readonly key: SpriteKey;
	readonly src: string;
}

const KENNEY_BASE = "/assets/kenney/PNG/Default size";

const MANIFEST: readonly ManifestEntry[] = [
	{ key: "tile_grass", src: `${KENNEY_BASE}/towerDefense_tile024.png` },
	{ key: "tile_path", src: `${KENNEY_BASE}/towerDefense_tile046.png` },
	{ key: "tile_slot", src: `${KENNEY_BASE}/towerDefense_tile181.png` },
	{ key: "tower_cannon", src: `${KENNEY_BASE}/towerDefense_tile205.png` },
	{ key: "tower_mg", src: `${KENNEY_BASE}/towerDefense_tile249.png` },
	{ key: "tower_mortar", src: `${KENNEY_BASE}/towerDefense_tile250.png` },
	{ key: "enemy_fast", src: `${KENNEY_BASE}/towerDefense_tile245.png` },
	{ key: "enemy_heavy", src: `${KENNEY_BASE}/towerDefense_tile246.png` },
	{ key: "projectile", src: `${KENNEY_BASE}/towerDefense_tile295.png` },
];

export type SpriteMap = ReadonlyMap<SpriteKey, HTMLImageElement | null>;

function loadImage(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = encodeURI(src);
	});
}

// Resolves once every sprite has either loaded or failed. Missing sprites
// come back as null so the renderer can fall back to primitives — useful
// when the Kenney pack hasn't been downloaded yet.
export async function loadSprites(): Promise<SpriteMap> {
	const entries = await Promise.all(
		MANIFEST.map(async ({ key, src }) => [key, await loadImage(src)] as const),
	);
	return new Map(entries);
}
