import {
	AmbientLight,
	BoxGeometry,
	Color,
	CylinderGeometry,
	DoubleSide,
	GridHelper,
	Group,
	type Light,
	type Material,
	Mesh,
	MeshBasicMaterial,
	MeshStandardMaterial,
	type Object3D,
	PointLight,
	SphereGeometry,
	Vector2,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { FilmShader } from "three/examples/jsm/shaders/FilmShader.js";
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader.js";
import type { ModelKey } from "../../assets/loader3d";
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

// Tron / Dead Space terminal palette. Cyan accent on near-black void; emissive
// surfaces blow out under the bloom pass to give the holographic glow.
const PALETTE = {
	bgClear: 0x000814, // void blue/black
	cyan: 0x5ce1ff, // primary glow
	cyanDim: 0x2a8aa8, // grid + secondary
	magentaSpark: 0xff5ce1, // glitch impact accent
	white: 0xffffff,
} as const;

// Style stamp shared across HUD + build-menu CSS so the values used by the
// variant runtime and the tokens/*.design.md file are derived from the same
// constants.
const HOLOGRAPHIC_FONT_FAMILY = '"Share Tech Mono","Roboto Mono",monospace';
const HUD_GLOW_COLOR = "#5ce1ff";
const HUD_GLOW_DIM = "rgba(92,225,255,0.45)";
const NEAR_BLACK = "#000814";
const STYLE_TAG_ID = "variant-a-holographic-styles";

// Horizontal flight distance for the build-menu card. AC: ~200px.
const MENU_FLY_PX = 200;

interface InstanceCache {
	readonly enemies: Map<Entity, Object3D>;
	readonly towers: Map<Entity, Object3D>;
	readonly projectiles: Map<Entity, Object3D>;
}

// A live spark for the 3D particle layer. Pooled-feel (we just remove on
// expiry); volumes are small (≤ ~64 sparks at a time) so allocation cost is
// negligible.
interface Spark {
	readonly mesh: Mesh;
	readonly vx: number;
	readonly vy: number;
	readonly life: number;
	age: number;
}

export function createHolographicVariant(ctx: VariantContext): VariantModule {
	const reducedMotion =
		typeof window !== "undefined" && typeof window.matchMedia === "function"
			? window.matchMedia("(prefers-reduced-motion: reduce)").matches
			: false;

	const root = new Group();
	root.name = "a-holographic-root";
	ctx.scene.add(root);

	const staticGroup = new Group();
	staticGroup.name = "static";
	root.add(staticGroup);

	const dynamicGroup = new Group();
	dynamicGroup.name = "dynamic";
	root.add(dynamicGroup);

	const sparksGroup = new Group();
	sparksGroup.name = "sparks";
	root.add(sparksGroup);

	const cache: InstanceCache = {
		enemies: new Map(),
		towers: new Map(),
		projectiles: new Map(),
	};
	const ownedMaterials: Material[] = [];
	const sparks: Spark[] = [];
	const lights: Light[] = [];
	let composer: EffectComposer | null = null;
	let filmPass: ShaderPass | null = null;
	let listener: ParticleEffectListener | null = null;
	let lastFrameTime = typeof performance !== "undefined" ? performance.now() : 0;

	function trackMaterial<T extends Material>(m: T): T {
		ownedMaterials.push(m);
		return m;
	}

	const matEnemyFast = trackMaterial(makeHoloMat({ emissive: 0xff5cc6, opacity: 0.85 }));
	const matEnemyHeavy = trackMaterial(makeHoloMat({ emissive: 0xffa05c, opacity: 0.85 }));
	const matTower = trackMaterial(makeHoloMat({ emissive: PALETTE.cyan, opacity: 0.9 }));
	const matProjectile = trackMaterial(
		new MeshBasicMaterial({ color: PALETTE.white, transparent: true, opacity: 0.95 }),
	);
	ownedMaterials.push(matProjectile);
	const matSparkCyan = trackMaterial(
		new MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 1 }),
	);
	const matSparkMagenta = trackMaterial(
		new MeshBasicMaterial({ color: PALETTE.magentaSpark, transparent: true, opacity: 1 }),
	);

	function applyMaterials(): void {
		// Repaint the base ground plane to near-black; the GridHelper added in
		// `setupLighting` provides the cyan visual grid above it. The original
		// `MeshStandardMaterial` is owned by `createThreeScene`, so swapping
		// the reference is safe — we don't dispose what we didn't allocate.
		ctx.ground.visible = true;
		const groundMat = new MeshBasicMaterial({ color: PALETTE.bgClear });
		ownedMaterials.push(groundMat);
		ctx.ground.material = groundMat;
		ctx.scene.background = new Color(PALETTE.bgClear);
		try {
			ctx.renderer.setClearColor?.(PALETTE.bgClear, 1);
		} catch {
			// renderer in tests is a stub; ignore
		}

		// Path glow lines (one quad per segment, emissive cyan).
		const pathMat = trackMaterial(makeHoloMat({ emissive: PALETTE.cyanDim, opacity: 0.55 }));
		for (let i = 1; i < PATH.length; i++) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dz = b.y - a.y;
			const len = Math.hypot(dx, dz);
			if (len === 0) continue;
			const geo = new BoxGeometry(len, 0.4, 6);
			const mesh = new Mesh(geo, pathMat);
			mesh.position.set((a.x + b.x) / 2, 0.4, (a.y + b.y) / 2);
			mesh.rotation.y = -Math.atan2(dz, dx);
			staticGroup.add(mesh);
		}

		// Slot rings — cyan halos on the ground.
		const slotMat = trackMaterial(makeHoloMat({ emissive: PALETTE.cyan, opacity: 0.7 }));
		for (const slot of BUILD_SLOTS) {
			const ring = new Mesh(
				new CylinderGeometry(BUILD_SLOT_RADIUS, BUILD_SLOT_RADIUS, 0.4, 24, 1, true),
				slotMat,
			);
			ring.position.set(slot.x, 0.4, slot.y);
			staticGroup.add(ring);
		}
	}

	function setupLighting(): void {
		const ambient = new AmbientLight(PALETTE.cyanDim, 0.3);
		ctx.scene.add(ambient);
		lights.push(ambient);
		const rim = new PointLight(PALETTE.cyan, 1.2, 1500, 1.6);
		rim.position.set(CANVAS_WIDTH / 2, 400, CANVAS_HEIGHT / 2);
		ctx.scene.add(rim);
		lights.push(rim);

		// Visible cyan grid that suggests an HUD floor plane.
		const grid = new GridHelper(
			Math.max(CANVAS_WIDTH, CANVAS_HEIGHT),
			30,
			PALETTE.cyan,
			PALETTE.cyanDim,
		);
		grid.position.set(CANVAS_WIDTH / 2, 0.2, CANVAS_HEIGHT / 2);
		const gridMat = grid.material as Material | Material[];
		if (Array.isArray(gridMat)) {
			for (const m of gridMat) ownedMaterials.push(m);
		} else {
			ownedMaterials.push(gridMat);
		}
		staticGroup.add(grid);
	}

	function setupPostprocess(): void {
		if (reducedMotion) return;
		try {
			// `WebGLRenderer.getContext()` throws or returns null when the renderer
			// isn't backed by a real WebGL surface (tests, headless). Bail in
			// that case so we render via the simple path.
			const gl = (ctx.renderer as unknown as { getContext?: () => unknown }).getContext?.();
			if (!gl) return;
			const c = new EffectComposer(ctx.renderer);
			c.addPass(new RenderPass(ctx.scene, ctx.camera));

			const bloom = new UnrealBloomPass(
				new Vector2(CANVAS_WIDTH, CANVAS_HEIGHT),
				1.2, // strength
				0.7, // radius
				0.18, // threshold
			);
			c.addPass(bloom);

			const film = new ShaderPass(FilmShader);
			if (film.uniforms.intensity) film.uniforms.intensity.value = 0.45;
			if (film.uniforms.grayscale) film.uniforms.grayscale.value = false;
			c.addPass(film);
			filmPass = film;

			const rgb = new ShaderPass(RGBShiftShader);
			if (rgb.uniforms.amount) rgb.uniforms.amount.value = 0.0025;
			c.addPass(rgb);

			c.addPass(new OutputPass());
			composer = c;
		} catch {
			composer = null;
		}
	}

	function mountHud(): void {
		ensureStyleTag();
		ctx.hud.gold.parentElement?.classList.add("variant-a-hud");
		ctx.hud.lives.parentElement?.classList.add("variant-a-hud");
		ctx.hud.wave.parentElement?.classList.add("variant-a-hud");
		// The HUD is a parent #hud — apply the class there too if present.
		const hudRoot =
			ctx.hud.gold.closest?.("#hud") ?? ctx.hud.gold.parentElement?.parentElement ?? null;
		hudRoot?.classList.add("variant-a-hud-root");
	}

	function mountBuildMenu(): void {
		ensureStyleTag();
		ctx.menu.classList.add("variant-a-menu");
	}

	function ensureStyleTag(): void {
		if (typeof document === "undefined") return;
		if (document.getElementById(STYLE_TAG_ID)) return;
		const tag = document.createElement("style");
		tag.id = STYLE_TAG_ID;
		tag.textContent = HOLOGRAPHIC_CSS;
		document.head.appendChild(tag);
	}

	function makeInstance(key: ModelKey): Object3D {
		const tpl = ctx.models.get(key);
		const node = tpl ? tpl.clone(true) : makePrimitive(key);
		// Repaint every mesh inside the clone with the holographic material so
		// Kenney GLBs blow out under bloom.
		const mat =
			key === "enemy_fast"
				? matEnemyFast
				: key === "enemy_heavy"
					? matEnemyHeavy
					: key === "projectile"
						? matProjectile
						: matTower;
		node.traverse((child) => {
			if ((child as Mesh).isMesh) {
				(child as Mesh).material = mat;
			}
		});
		return node;
	}

	function makePrimitive(key: ModelKey): Object3D {
		switch (key) {
			case "enemy_fast":
				return new Mesh(new SphereGeometry(8, 12, 8), matEnemyFast);
			case "enemy_heavy":
				return new Mesh(new BoxGeometry(20, 20, 20), matEnemyHeavy);
			case "tower_cannon":
				return new Mesh(new BoxGeometry(28, 26, 28), matTower);
			case "tower_mg":
				return new Mesh(new CylinderGeometry(14, 14, 24, 12), matTower);
			case "tower_mortar":
				return new Mesh(new CylinderGeometry(16, 16, 26, 8), matTower);
			case "projectile":
				return new Mesh(new SphereGeometry(3, 8, 6), matProjectile);
			default:
				return new Mesh(new BoxGeometry(8, 8, 8), matTower);
		}
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
			const key: ModelKey =
				tower.kind === "cannon"
					? "tower_cannon"
					: tower.kind === "mg"
						? "tower_mg"
						: "tower_mortar";
			let mesh = cache.towers.get(e);
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

	function spawnParticles(event: ParticleEvent): void {
		// Glitch / spark visual: a handful of small emissive cubes scatter in a
		// short radial burst from the impact point. Counts/colors vary by event.
		const counts = { muzzle: 4, impact: 8, explosion: 14, death: 10 } as const;
		const lives = { muzzle: 0.18, impact: 0.32, explosion: 0.55, death: 0.4 } as const;
		const speedRange = {
			muzzle: [40, 90],
			impact: [80, 200],
			explosion: [120, 280],
			death: [60, 180],
		} as const;
		const count = counts[event.kind];
		const life = lives[event.kind];
		const [vmin, vmax] = speedRange[event.kind];
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = vmin + Math.random() * (vmax - vmin);
			const cube = new Mesh(
				new BoxGeometry(2.4, 2.4, 2.4),
				i % 3 === 0 ? matSparkMagenta : matSparkCyan,
			);
			cube.position.set(event.x, 4 + Math.random() * 4, event.y);
			sparksGroup.add(cube);
			sparks.push({
				mesh: cube,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				life,
				age: 0,
			});
		}
	}

	function updateSparks(dt: number): void {
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
			s.mesh.position.x += s.vx * dt;
			s.mesh.position.z += s.vy * dt;
			const remaining = 1 - s.age / s.life;
			s.mesh.scale.setScalar(Math.max(0.1, remaining));
		}
	}

	listener = (e: ParticleEffect) => spawnParticles(e);
	setParticleEffectListener(listener);

	return {
		id: "A",
		applyMaterials,
		setupLighting,
		setupPostprocess,
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
			if (filmPass?.uniforms.time) filmPass.uniforms.time.value = now / 1000;
		},
		render() {
			if (composer) composer.render();
			else ctx.renderer.render(ctx.scene, ctx.camera);
		},
		dispose() {
			setParticleEffectListener(null);
			ctx.scene.remove(root);
			for (const light of lights) ctx.scene.remove(light);
			for (const m of ownedMaterials) m.dispose();
			cache.enemies.clear();
			cache.towers.clear();
			cache.projectiles.clear();
			sparks.length = 0;
			composer?.dispose?.();
			if (typeof document !== "undefined") {
				document.getElementById(STYLE_TAG_ID)?.remove();
				ctx.menu.classList.remove("variant-a-menu");
			}
		},
	};
}

interface HoloMatOpts {
	readonly emissive: number;
	readonly opacity: number;
}

function makeHoloMat(opts: HoloMatOpts): MeshStandardMaterial {
	return new MeshStandardMaterial({
		color: 0x000000,
		emissive: opts.emissive,
		emissiveIntensity: 1.4,
		transparent: opts.opacity < 1,
		opacity: opts.opacity,
		metalness: 0.1,
		roughness: 0.6,
		side: DoubleSide,
	});
}

function evictDead(map: Map<Entity, Object3D>, live: Set<Entity>, parent: Group): void {
	for (const [entity, mesh] of map) {
		if (!live.has(entity)) {
			parent.remove(mesh);
			map.delete(entity);
		}
	}
}

// CSS injected into `document.head` once when the variant mounts. Drives the
// HUD glow + build-menu fly-in animation. Kept here (not in index.html) so
// neutral and B/C variants don't ship the holographic chrome by default.
const HOLOGRAPHIC_CSS = `
@keyframes variant-a-menu-fly-in {
	from { transform: translateX(-${MENU_FLY_PX}px) scale(0.85); opacity: 0; }
	to { transform: translateX(0) scale(1); opacity: 1; }
}
@keyframes variant-a-hud-pulse {
	0%, 100% { text-shadow: 0 0 4px ${HUD_GLOW_COLOR}, 0 0 10px ${HUD_GLOW_DIM}; }
	50% { text-shadow: 0 0 6px ${HUD_GLOW_COLOR}, 0 0 16px ${HUD_GLOW_COLOR}; }
}
.variant-a-hud-root {
	background: rgba(0, 8, 20, 0.78) !important;
	border: 1px solid ${HUD_GLOW_COLOR} !important;
	box-shadow: 0 0 14px ${HUD_GLOW_DIM} !important;
}
.variant-a-hud-root .label {
	color: ${HUD_GLOW_COLOR} !important;
	letter-spacing: 0.18em !important;
}
.variant-a-hud-root .value {
	color: ${HUD_GLOW_COLOR} !important;
	font-family: ${HOLOGRAPHIC_FONT_FAMILY} !important;
	animation: variant-a-hud-pulse 2.4s ease-in-out infinite;
}
#build-menu.variant-a-menu {
	background: rgba(0, 8, 20, 0.92) !important;
	border: 1px solid ${HUD_GLOW_COLOR} !important;
	box-shadow: 0 0 22px ${HUD_GLOW_DIM} !important;
	color: ${HUD_GLOW_COLOR} !important;
	font-family: ${HOLOGRAPHIC_FONT_FAMILY} !important;
	transform-origin: left center;
}
#build-menu.variant-a-menu.open {
	animation: variant-a-menu-fly-in 220ms cubic-bezier(0.25, 1, 0.5, 1) both;
}
#build-menu.variant-a-menu .menu-header,
#build-menu.variant-a-menu .tower-name,
#build-menu.variant-a-menu .tower-stats,
#build-menu.variant-a-menu .tower-cost,
#build-menu.variant-a-menu .invested {
	color: ${HUD_GLOW_COLOR} !important;
}
#build-menu.variant-a-menu .tower-btn {
	background: rgba(0, 8, 20, 0.8) !important;
	border: 1px solid ${HUD_GLOW_COLOR} !important;
	color: ${HUD_GLOW_COLOR} !important;
}
#build-menu.variant-a-menu .tower-btn.disabled {
	opacity: 0.5 !important;
}
#build-menu.variant-a-menu .menu-close {
	border: 1px solid ${HUD_GLOW_DIM} !important;
	color: ${HUD_GLOW_COLOR} !important;
	background: ${NEAR_BLACK} !important;
}
@media (prefers-reduced-motion: reduce) {
	#build-menu.variant-a-menu.open { animation: none; }
	.variant-a-hud-root .value { animation: none; }
}
`;
