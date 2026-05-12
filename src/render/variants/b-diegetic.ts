import {
	AmbientLight,
	BoxGeometry,
	CanvasTexture,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	Group,
	type Light,
	type Material,
	Mesh,
	MeshLambertMaterial,
	MeshStandardMaterial,
	type Object3D,
	SphereGeometry,
	type Texture,
} from "three";
import type { ModelKey, ModelMap } from "../../assets/loader3d";
import type { Entity, World } from "../../ecs";
import { C_ENEMY_TYPE, C_HEALTH, C_POSITION, type EnemyType, type Position } from "../../enemies";
import { BUILD_SLOTS, BUILD_SLOT_RADIUS, CANVAS_HEIGHT, CANVAS_WIDTH, PATH } from "../../level";
import {
	type ParticleEffect,
	type ParticleEffectListener,
	setParticleEffectListener,
} from "../../particles";
import { C_PROJECTILE, C_TOWER, type Projectile, type Tower } from "../../towers";
import { MODEL_HEIGHT } from "../three/neutral";
import type { ParticleEvent, VariantContext, VariantModule } from "./types";

// Tabletop-diorama palette: warm bulb above varnished pine, hand-painted
// figures, polished brass plaques. No emission anywhere — lighting carries
// the look. Hex values mirror tokens/b-diegetic.design.md.
const PALETTE = {
	bgClear: 0x2a1f15, // burnt umber
	wood: 0x6d4a2a, // stained walnut (path / plaque body)
	woodLight: 0x8a6238, // pine board (ground)
	brass: 0xffb454, // amber
	brassDim: 0xa06a2a, // aged brass (off-state)
	parchment: 0xf3e3c2, // body copy on wood
	smokeGray: 0x9a8c7a, // warm grey for smoke puffs
	shellBrass: 0xdca35a, // ejected casing
	enemyFast: 0xc24646, // tin-soldier red
	enemyHeavy: 0x8a6a4a, // resin-cast khaki
	towerCannon: 0x6a7a9a, // pewter blue
	towerMg: 0x4a8a4a, // miniature green
	towerMortar: 0x9a5a4a, // brick
	projectile: 0xf3e3c2,
} as const;

const STYLE_TAG_ID = "variant-b-diegetic-styles";

// Cogwheel rotation duration. AC: cog "flips open from the selected slot".
const COG_OPEN_MS = 280;

interface InstanceCache {
	readonly enemies: Map<Entity, Object3D>;
	readonly towers: Map<Entity, Object3D>;
	readonly projectiles: Map<Entity, Object3D>;
	// Each tower/enemy gets a soft ground-shadow disc that follows it. Cached
	// per-entity so we don't allocate every frame.
	readonly shadows: Map<Entity, Mesh>;
}

// A spark for the diegetic particle layer. Kind affects gravity, drag, and
// material so smoke puffs behave differently from brass shells.
interface Spark {
	readonly mesh: Mesh;
	readonly kind: "smoke" | "shell" | "shellSpin";
	vx: number;
	vy: number;
	vz: number;
	readonly life: number;
	age: number;
}

export function createDiegeticVariant(ctx: VariantContext): VariantModule {
	const root = new Group();
	root.name = "b-diegetic-root";
	ctx.scene.add(root);

	const staticGroup = new Group();
	staticGroup.name = "static";
	root.add(staticGroup);

	const dynamicGroup = new Group();
	dynamicGroup.name = "dynamic";
	root.add(dynamicGroup);

	const shadowGroup = new Group();
	shadowGroup.name = "shadows";
	root.add(shadowGroup);

	const sparksGroup = new Group();
	sparksGroup.name = "sparks";
	root.add(sparksGroup);

	const cache: InstanceCache = {
		enemies: new Map(),
		towers: new Map(),
		projectiles: new Map(),
		shadows: new Map(),
	};
	const ownedMaterials: Material[] = [];
	const ownedTextures: Texture[] = [];
	const sparks: Spark[] = [];
	const lights: Light[] = [];
	let listener: ParticleEffectListener | null = null;
	let lastFrameTime = typeof performance !== "undefined" ? performance.now() : 0;
	let plaqueEl: HTMLElement | null = null;

	function trackMaterial<T extends Material>(m: T): T {
		ownedMaterials.push(m);
		return m;
	}

	// Lambert is the diegetic material of choice: it picks up directional
	// light without the shiny highlights of Standard, mimicking matte
	// hand-painted miniatures. Higher-fidelity surfaces (cogwheel ring) use
	// Standard with low metalness/roughness for the brass sheen.
	const matEnemyFast = trackMaterial(new MeshLambertMaterial({ color: PALETTE.enemyFast }));
	const matEnemyHeavy = trackMaterial(new MeshLambertMaterial({ color: PALETTE.enemyHeavy }));
	const matTowerCannon = trackMaterial(new MeshLambertMaterial({ color: PALETTE.towerCannon }));
	const matTowerMg = trackMaterial(new MeshLambertMaterial({ color: PALETTE.towerMg }));
	const matTowerMortar = trackMaterial(new MeshLambertMaterial({ color: PALETTE.towerMortar }));
	const matProjectile = trackMaterial(
		new MeshStandardMaterial({
			color: PALETTE.projectile,
			metalness: 0.4,
			roughness: 0.5,
		}),
	);
	const matSmoke = trackMaterial(
		new MeshLambertMaterial({
			color: PALETTE.smokeGray,
			transparent: true,
			opacity: 0.7,
		}),
	);
	const matShell = trackMaterial(
		new MeshStandardMaterial({
			color: PALETTE.shellBrass,
			metalness: 0.6,
			roughness: 0.35,
		}),
	);

	// Soft contact-shadow texture: a circular alpha gradient drawn on a
	// 64x64 canvas. Reused by every shadow disc so we only pay the cost
	// once.
	const shadowTexture = makeShadowTexture();
	if (shadowTexture) ownedTextures.push(shadowTexture);
	const shadowMatOpts: ConstructorParameters<typeof MeshLambertMaterial>[0] = {
		color: 0x000000,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
	};
	if (shadowTexture) shadowMatOpts.map = shadowTexture;
	const matShadow = trackMaterial(new MeshLambertMaterial(shadowMatOpts));

	function applyMaterials(): void {
		// Stained-pine board: replace the default green ground with a warm
		// woodgrain. Materials owned by the scene factory aren't disposed by
		// us — we install ours and track it for cleanup.
		ctx.ground.visible = true;
		const groundMat = new MeshLambertMaterial({ color: PALETTE.woodLight });
		ownedMaterials.push(groundMat);
		ctx.ground.material = groundMat;
		ctx.scene.background = new Color(PALETTE.bgClear);
		try {
			ctx.renderer.setClearColor?.(PALETTE.bgClear, 1);
		} catch {
			// renderer is a stub in tests; ignore
		}

		// Walnut path strip — slightly raised so it reads as inlaid wood.
		const pathMat = trackMaterial(new MeshLambertMaterial({ color: PALETTE.wood }));
		for (let i = 1; i < PATH.length; i++) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dz = b.y - a.y;
			const len = Math.hypot(dx, dz);
			if (len === 0) continue;
			const geo = new BoxGeometry(len, 0.6, 36);
			const mesh = new Mesh(geo, pathMat);
			mesh.position.set((a.x + b.x) / 2, 0.5, (a.y + b.y) / 2);
			mesh.rotation.y = -Math.atan2(dz, dx);
			staticGroup.add(mesh);
		}

		// Brass slot rims: short cylindrical rings sunk into the board,
		// catching the warm sun on their inner edge.
		const slotMat = trackMaterial(
			new MeshStandardMaterial({
				color: PALETTE.brass,
				metalness: 0.55,
				roughness: 0.4,
			}),
		);
		for (const slot of BUILD_SLOTS) {
			const ring = new Mesh(
				new CylinderGeometry(BUILD_SLOT_RADIUS, BUILD_SLOT_RADIUS, 0.6, 28, 1, true),
				slotMat,
			);
			ring.position.set(slot.x, 0.6, slot.y);
			staticGroup.add(ring);
		}
	}

	function setupLighting(): void {
		// Warm sun from upper-left. The lower ambient comes from the
		// opposite side to keep unlit faces from going fully black, but
		// stays dim so the directional cast does the heavy lifting.
		const ambient = new AmbientLight(0x6a4a2a, 0.45);
		ctx.scene.add(ambient);
		lights.push(ambient);

		const sun = new DirectionalLight(0xffd9a0, 1.05);
		sun.position.set(CANVAS_WIDTH * 0.15, 600, CANVAS_HEIGHT * 0.15);
		sun.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
		ctx.scene.add(sun);
		ctx.scene.add(sun.target);
		lights.push(sun);
	}

	// AC: "no postprocess". Lighting + materials carry the look — we don't
	// implement `setupPostprocess` and `render` falls through to the host's
	// default `threeScene.render()`.

	function mountHud(): void {
		ensureStyleTag();
		const hudRoot =
			(ctx.hud.gold.closest?.("#hud") as HTMLElement | null) ??
			(ctx.hud.gold.parentElement?.parentElement as HTMLElement | null) ??
			null;
		if (hudRoot) {
			hudRoot.classList.add("variant-b-plaque");
			plaqueEl = hudRoot;
		}
		const labels = hudRoot?.querySelectorAll<HTMLElement>(".label") ?? [];
		for (const el of Array.from(labels)) el.classList.add("variant-b-label");
		const values = hudRoot?.querySelectorAll<HTMLElement>(".value") ?? [];
		for (const el of Array.from(values)) el.classList.add("variant-b-value");
	}

	function mountBuildMenu(): void {
		ensureStyleTag();
		ctx.menu.classList.add("variant-b-cog");
	}

	function ensureStyleTag(): void {
		if (typeof document === "undefined") return;
		if (document.getElementById(STYLE_TAG_ID)) return;
		const tag = document.createElement("style");
		tag.id = STYLE_TAG_ID;
		tag.textContent = DIEGETIC_CSS;
		document.head.appendChild(tag);
	}

	function pickTowerMat(kind: Tower["kind"]): MeshLambertMaterial {
		return kind === "cannon" ? matTowerCannon : kind === "mg" ? matTowerMg : matTowerMortar;
	}

	function makeInstance(key: ModelKey, models: ModelMap): Object3D {
		const tpl = models.get(key);
		if (tpl) {
			// Preserve Kenney vertex colors / textures when present — the AC
			// asks for "Kenney vertex colors + light textures" rather than the
			// repaint that variant A does. We only swap to Lambert if a mesh
			// has no useful material info.
			const node = tpl.clone(true);
			node.traverse((child) => {
				const mesh = child as Mesh;
				if (!mesh.isMesh) return;
				const mat = mesh.material as Material | Material[];
				if (Array.isArray(mat)) return;
				if (!mat) {
					mesh.material = fallbackMatForKey(key);
				}
			});
			return node;
		}
		return makePrimitive(key);
	}

	function fallbackMatForKey(key: ModelKey): Material {
		switch (key) {
			case "enemy_fast":
				return matEnemyFast;
			case "enemy_heavy":
				return matEnemyHeavy;
			case "tower_cannon":
				return matTowerCannon;
			case "tower_mg":
				return matTowerMg;
			case "tower_mortar":
				return matTowerMortar;
			case "projectile":
				return matProjectile;
			default:
				return matTowerCannon;
		}
	}

	function makePrimitive(key: ModelKey): Object3D {
		switch (key) {
			case "enemy_fast":
				return new Mesh(new SphereGeometry(8, 16, 12), matEnemyFast);
			case "enemy_heavy":
				return new Mesh(new BoxGeometry(20, 20, 20), matEnemyHeavy);
			case "tower_cannon":
				return new Mesh(new BoxGeometry(28, 26, 28), matTowerCannon);
			case "tower_mg":
				return new Mesh(new CylinderGeometry(14, 14, 24, 16), matTowerMg);
			case "tower_mortar":
				return new Mesh(new CylinderGeometry(16, 16, 26, 12), matTowerMortar);
			case "projectile":
				return new Mesh(new SphereGeometry(3, 10, 8), matProjectile);
			default:
				return new Mesh(new BoxGeometry(8, 8, 8), matTowerCannon);
		}
	}

	function ensureShadow(entity: Entity, radius: number): Mesh {
		const existing = cache.shadows.get(entity);
		if (existing) return existing;
		const geo = new CircleGeometry(radius, 24);
		const mesh = new Mesh(geo, matShadow);
		mesh.rotation.x = -Math.PI / 2;
		shadowGroup.add(mesh);
		cache.shadows.set(entity, mesh);
		return mesh;
	}

	function evictShadow(entity: Entity): void {
		const mesh = cache.shadows.get(entity);
		if (!mesh) return;
		shadowGroup.remove(mesh);
		mesh.geometry.dispose();
		cache.shadows.delete(entity);
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
				mesh = makeInstance(key, ctx.models);
				cache.enemies.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(pos.x, MODEL_HEIGHT[key], pos.y);
			const shadow = ensureShadow(e, et.kind === "fast" ? 9 : 13);
			shadow.position.set(pos.x, 0.7, pos.y);
		}
		for (const [entity, mesh] of cache.enemies) {
			if (live.has(entity)) continue;
			dynamicGroup.remove(mesh);
			cache.enemies.delete(entity);
			evictShadow(entity);
		}
	}

	function syncTowers(world: World): void {
		const live = new Set<Entity>();
		for (const e of world.query(C_TOWER)) {
			const tower = world.getComponent<Tower>(e, C_TOWER);
			if (!tower) continue;
			live.add(e);
			const key: ModelKey =
				tower.kind === "cannon"
					? "tower_cannon"
					: tower.kind === "mg"
						? "tower_mg"
						: "tower_mortar";
			let mesh = cache.towers.get(e);
			if (!mesh) {
				mesh = makeInstance(key, ctx.models);
				cache.towers.set(e, mesh);
				dynamicGroup.add(mesh);
				// Tint primitives that fell through to fallback materials so
				// each tower kind reads as a different miniature paint.
				mesh.traverse((child) => {
					const m = child as Mesh;
					if (m.isMesh && !Array.isArray(m.material) && m.material === fallbackMatForKey(key)) {
						m.material = pickTowerMat(tower.kind);
					}
				});
			}
			mesh.position.set(tower.x, MODEL_HEIGHT[key], tower.y);
			const shadow = ensureShadow(e, 18);
			shadow.position.set(tower.x, 0.8, tower.y);
		}
		for (const [entity, mesh] of cache.towers) {
			if (live.has(entity)) continue;
			dynamicGroup.remove(mesh);
			cache.towers.delete(entity);
			evictShadow(entity);
		}
	}

	function syncProjectiles(world: World): void {
		const live = new Set<Entity>();
		for (const e of world.query(C_PROJECTILE)) {
			const proj = world.getComponent<Projectile>(e, C_PROJECTILE);
			if (!proj) continue;
			live.add(e);
			let mesh = cache.projectiles.get(e);
			if (!mesh) {
				mesh = makeInstance("projectile", ctx.models);
				cache.projectiles.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(proj.x, MODEL_HEIGHT.projectile, proj.y);
		}
		for (const [entity, mesh] of cache.projectiles) {
			if (live.has(entity)) continue;
			dynamicGroup.remove(mesh);
			cache.projectiles.delete(entity);
		}
	}

	function spawnSmokePuffs(x: number, y: number, count: number, life: number): void {
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 18 + Math.random() * 28;
			const radius = 4 + Math.random() * 3;
			const puff = new Mesh(new SphereGeometry(radius, 8, 6), matSmoke);
			puff.position.set(x, 6 + Math.random() * 5, y);
			sparksGroup.add(puff);
			sparks.push({
				mesh: puff,
				kind: "smoke",
				vx: Math.cos(angle) * speed,
				vy: 24 + Math.random() * 18,
				vz: Math.sin(angle) * speed,
				life,
				age: 0,
			});
		}
	}

	function spawnBrassShells(
		x: number,
		y: number,
		count: number,
		life: number,
		spin: boolean,
	): void {
		for (let i = 0; i < count; i++) {
			// Casings always eject toward the right; sign flip on a fraction
			// gives a little spread without losing the "ejection port" feel.
			const baseAngle = Math.random() < 0.85 ? Math.PI * 0.25 : Math.PI * 0.75;
			const angle = baseAngle + (Math.random() - 0.5) * 0.5;
			const speed = 80 + Math.random() * 120;
			const shell = new Mesh(new CylinderGeometry(1.2, 1.2, 3.6, 8), matShell);
			shell.position.set(x, 8 + Math.random() * 3, y);
			shell.rotation.z = Math.PI / 2;
			sparksGroup.add(shell);
			sparks.push({
				mesh: shell,
				kind: spin ? "shellSpin" : "shell",
				vx: Math.cos(angle) * speed,
				vy: 110 + Math.random() * 60,
				vz: Math.sin(angle) * speed,
				life,
				age: 0,
			});
		}
	}

	function spawnParticles(event: ParticleEvent): void {
		// Diegetic hit motif: smoke + brass shell ejection. Counts/lives
		// vary by event so a muzzle flash reads quieter than an explosion.
		switch (event.kind) {
			case "muzzle":
				spawnSmokePuffs(event.x, event.y, 3, 0.45);
				spawnBrassShells(event.x, event.y, 2, 0.7, true);
				break;
			case "impact":
				spawnSmokePuffs(event.x, event.y, 5, 0.55);
				spawnBrassShells(event.x, event.y, 3, 0.6, false);
				break;
			case "explosion":
				spawnSmokePuffs(event.x, event.y, 10, 0.8);
				spawnBrassShells(event.x, event.y, 6, 0.7, true);
				break;
			case "death":
				spawnSmokePuffs(event.x, event.y, 7, 0.7);
				spawnBrassShells(event.x, event.y, 2, 0.6, false);
				break;
		}
	}

	function updateSparks(dt: number): void {
		const gravity = -260; // px/s² downward (we use +y as up)
		const drag = 1.2;
		const k = Math.exp(-drag * dt);
		for (let i = sparks.length - 1; i >= 0; i--) {
			const s = sparks[i];
			if (!s) continue;
			s.age += dt;
			if (s.age >= s.life) {
				sparksGroup.remove(s.mesh);
				s.mesh.geometry.dispose();
				sparks.splice(i, 1);
				continue;
			}
			s.vy += gravity * dt;
			s.vx *= k;
			s.vz *= k;
			s.mesh.position.x += s.vx * dt;
			s.mesh.position.y += s.vy * dt;
			s.mesh.position.z += s.vz * dt;
			// Floor: smoke fades up off the table; shells bounce once.
			if (s.kind !== "smoke" && s.mesh.position.y < 1) {
				s.mesh.position.y = 1;
				s.vy = Math.abs(s.vy) * 0.35;
				s.vx *= 0.5;
				s.vz *= 0.5;
			}
			const remaining = 1 - s.age / s.life;
			if (s.kind === "smoke") {
				// Smoke grows and fades.
				const scale = 1 + (1 - remaining) * 1.6;
				s.mesh.scale.setScalar(scale);
			} else if (s.kind === "shellSpin") {
				// Spinning casings tumble through the air.
				s.mesh.rotation.x += dt * 18;
				s.mesh.rotation.y += dt * 12;
			}
		}
	}

	listener = (e: ParticleEffect) => spawnParticles(e);
	setParticleEffectListener(listener);

	return {
		id: "B",
		applyMaterials,
		setupLighting,
		mountHud,
		mountBuildMenu,
		spawnParticles,
		update(world) {
			const now = typeof performance !== "undefined" ? performance.now() : lastFrameTime + 16;
			const dt = Math.min(0.05, Math.max(0, (now - lastFrameTime) / 1000));
			lastFrameTime = now;
			syncEnemies(world);
			syncTowers(world);
			syncProjectiles(world);
			updateSparks(dt);
		},
		dispose() {
			setParticleEffectListener(null);
			ctx.scene.remove(root);
			for (const light of lights) {
				ctx.scene.remove(light);
				if ((light as DirectionalLight).target) {
					ctx.scene.remove((light as DirectionalLight).target);
				}
			}
			for (const m of ownedMaterials) m.dispose();
			for (const t of ownedTextures) t.dispose();
			cache.enemies.clear();
			cache.towers.clear();
			cache.projectiles.clear();
			for (const [, mesh] of cache.shadows) mesh.geometry.dispose();
			cache.shadows.clear();
			sparks.length = 0;
			if (typeof document !== "undefined") {
				document.getElementById(STYLE_TAG_ID)?.remove();
				ctx.menu.classList.remove("variant-b-cog");
				if (plaqueEl) {
					plaqueEl.classList.remove("variant-b-plaque");
					for (const el of Array.from(plaqueEl.querySelectorAll<HTMLElement>(".variant-b-label"))) {
						el.classList.remove("variant-b-label");
					}
					for (const el of Array.from(plaqueEl.querySelectorAll<HTMLElement>(".variant-b-value"))) {
						el.classList.remove("variant-b-value");
					}
				}
			}
		},
	};
}

// 64x64 radial-gradient texture used as the alpha map for soft contact
// shadows. Returns null when document isn't available (Bun unit tests).
function makeShadowTexture(): Texture | null {
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = 64;
	canvas.height = 64;
	const ctx2d = canvas.getContext("2d");
	if (!ctx2d) return null;
	const grad = ctx2d.createRadialGradient(32, 32, 4, 32, 32, 30);
	grad.addColorStop(0, "rgba(0,0,0,1)");
	grad.addColorStop(0.6, "rgba(0,0,0,0.55)");
	grad.addColorStop(1, "rgba(0,0,0,0)");
	ctx2d.fillStyle = grad;
	ctx2d.fillRect(0, 0, 64, 64);
	const tex = new CanvasTexture(canvas);
	tex.needsUpdate = true;
	return tex;
}

const BRASS = "#ffb454";
const BRASS_DIM = "#a06a2a";
const WALNUT = "#6d4a2a";
const WOOD_DARK = "#3a2a1c";
const PARCHMENT = "#f3e3c2";
const SERIF_HEADLINE = '"IM Fell English SC","Cormorant SC",Georgia,serif';
const SERIF_BODY = '"Cormorant Garamond","Cormorant",Georgia,serif';

// CSS injected when the variant mounts. Drives the brass plaque (HUD) and
// the cogwheel rotation (build menu). Kept here so neutral and A don't ship
// the diegetic chrome by default. Reduced-motion users get the open state
// without rotation.
const DIEGETIC_CSS = `
@keyframes variant-b-cog-open {
	from { transform: rotate(-45deg) scale(0.6); opacity: 0; }
	to { transform: rotate(0deg) scale(1); opacity: 1; }
}
#hud.variant-b-plaque {
	background: linear-gradient(180deg, ${WALNUT} 0%, ${WOOD_DARK} 100%) !important;
	border: 1px solid ${BRASS} !important;
	box-shadow:
		inset 0 1px 0 rgba(255, 220, 160, 0.35),
		0 4px 10px rgba(0, 0, 0, 0.6) !important;
	border-radius: 6px !important;
	padding: 8px 12px !important;
	font-family: ${SERIF_HEADLINE} !important;
}
#hud.variant-b-plaque .label,
.variant-b-label {
	color: ${PARCHMENT} !important;
	letter-spacing: 0.16em !important;
	font-family: ${SERIF_HEADLINE} !important;
	text-transform: uppercase !important;
}
#hud.variant-b-plaque .value,
.variant-b-value {
	color: ${BRASS} !important;
	font-family: ${SERIF_HEADLINE} !important;
	text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55) !important;
}
#build-menu.variant-b-cog {
	background: radial-gradient(circle at 50% 50%, ${WALNUT} 0%, ${WALNUT} 60%, ${BRASS} 60%, ${BRASS_DIM} 100%) !important;
	border: 2px solid ${BRASS} !important;
	color: ${PARCHMENT} !important;
	font-family: ${SERIF_BODY} !important;
	border-radius: 50% !important;
	min-width: 240px !important;
	min-height: 240px !important;
	padding: 28px !important;
	box-shadow:
		inset 0 0 0 4px ${WOOD_DARK},
		inset 0 0 0 6px ${BRASS_DIM},
		0 6px 14px rgba(0, 0, 0, 0.55) !important;
	transform-origin: left center;
}
#build-menu.variant-b-cog.open {
	animation: variant-b-cog-open ${COG_OPEN_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
#build-menu.variant-b-cog .menu-header {
	color: ${BRASS} !important;
	font-family: ${SERIF_HEADLINE} !important;
	text-align: center;
	letter-spacing: 0.12em;
}
#build-menu.variant-b-cog .tower-btn {
	background: ${WOOD_DARK} !important;
	border: 1px solid ${BRASS_DIM} !important;
	color: ${PARCHMENT} !important;
	font-family: ${SERIF_BODY} !important;
}
#build-menu.variant-b-cog .tower-btn:hover:not(.disabled) {
	background: ${WALNUT} !important;
	border-color: ${BRASS} !important;
}
#build-menu.variant-b-cog .tower-btn.disabled {
	opacity: 0.55 !important;
	color: ${BRASS_DIM} !important;
}
#build-menu.variant-b-cog .tower-name {
	color: ${PARCHMENT} !important;
	font-family: ${SERIF_HEADLINE} !important;
}
#build-menu.variant-b-cog .tower-cost {
	color: ${BRASS} !important;
}
#build-menu.variant-b-cog .tower-cost.maxed {
	color: ${PARCHMENT} !important;
}
#build-menu.variant-b-cog .tower-stats {
	color: ${PARCHMENT} !important;
	opacity: 0.85;
}
#build-menu.variant-b-cog .invested {
	color: ${BRASS_DIM} !important;
}
#build-menu.variant-b-cog .menu-close {
	background: ${WOOD_DARK} !important;
	border: 1px solid ${BRASS_DIM} !important;
	color: ${PARCHMENT} !important;
}
@media (prefers-reduced-motion: reduce) {
	#build-menu.variant-b-cog.open { animation: none; }
}
`;
