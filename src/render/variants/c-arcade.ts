import {
	AmbientLight,
	BoxGeometry,
	Color,
	CylinderGeometry,
	DataTexture,
	DirectionalLight,
	DoubleSide,
	Group,
	type Light,
	type Material,
	Mesh,
	MeshBasicMaterial,
	MeshToonMaterial,
	NearestFilter,
	type Object3D,
	RedFormat,
	Shape,
	ShapeGeometry,
	SphereGeometry,
	type Texture,
	Vector2,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
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

// Saturated arcade-pop palette. Hex values mirror tokens/c-arcade.design.md.
// All toon materials emit no light themselves — banding comes from the
// gradient ramp + flat directional fill, and the silhouette is sold by the
// outline pass.
const PALETTE = {
	bgClear: 0x1a0d2a, // deep grape
	ground: 0x2a1745, // saturated indigo board
	path: 0xff8a3d, // candy-orange road
	slot: 0xffe93d, // arcade gold rim
	magenta: 0xff3df5,
	lime: 0x7cff5c,
	cyan: 0x5ce1ff,
	white: 0xffffff,
	enemyFast: 0xff3df5, // magenta tin-soldier
	enemyHeavy: 0x7cff5c, // lime brute
	towerCannon: 0x5ce1ff, // cyan
	towerMg: 0x7cff5c, // lime
	towerMortar: 0xff3df5, // magenta
	projectile: 0xffe93d, // arcade gold
	confettiA: 0xff3df5,
	confettiB: 0x7cff5c,
	confettiC: 0x5ce1ff,
	confettiD: 0xffe93d,
	confettiE: 0xff8a3d,
	star: 0xffe93d,
} as const;

const STYLE_TAG_ID = "variant-c-arcade-styles";

// HUD bounce + menu wheel timing constants. AC: bouncy speech bubbles +
// bouncy radial wheel rotating around the selected slot. Easing is a
// back-ease that overshoots once for the squash/stretch read.
const HUD_BOUNCE_MS = 360;
const MENU_WHEEL_MS = 380;

interface InstanceCache {
	readonly enemies: Map<Entity, Object3D>;
	readonly towers: Map<Entity, Object3D>;
	readonly projectiles: Map<Entity, Object3D>;
}

// A single arcade spark. Confetti are thin spinning rectangles; stars are
// flat 5-point shapes that pop and fade. Stars carry slightly less velocity
// so the eye reads them as the comic-book accent on top of the confetti.
interface Spark {
	readonly mesh: Mesh;
	readonly kind: "confetti" | "star";
	vx: number;
	vy: number;
	vz: number;
	spin: number;
	readonly life: number;
	age: number;
}

export function createArcadeVariant(ctx: VariantContext): VariantModule {
	const root = new Group();
	root.name = "c-arcade-root";
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
	const ownedTextures: Texture[] = [];
	const sparks: Spark[] = [];
	const lights: Light[] = [];
	let composer: EffectComposer | null = null;
	let outlinePass: OutlinePass | null = null;
	let listener: ParticleEffectListener | null = null;
	let lastFrameTime = typeof performance !== "undefined" ? performance.now() : 0;
	let hudRootEl: HTMLElement | null = null;

	function trackMaterial<T extends Material>(m: T): T {
		ownedMaterials.push(m);
		return m;
	}

	// 4-step toon ramp gives the cartoon banding without the visible
	// posterized stripes a 2-step ramp would produce. Stored as a 1-channel
	// DataTexture per the three.js MeshToonMaterial recipe.
	const gradientTex = makeToonGradient();
	if (gradientTex) ownedTextures.push(gradientTex);

	function makeToonMat(color: number): MeshToonMaterial {
		return trackMaterial(
			new MeshToonMaterial({
				color,
				gradientMap: gradientTex,
			}),
		);
	}

	const matEnemyFast = makeToonMat(PALETTE.enemyFast);
	const matEnemyHeavy = makeToonMat(PALETTE.enemyHeavy);
	const matTowerCannon = makeToonMat(PALETTE.towerCannon);
	const matTowerMg = makeToonMat(PALETTE.towerMg);
	const matTowerMortar = makeToonMat(PALETTE.towerMortar);
	const matProjectile = trackMaterial(new MeshBasicMaterial({ color: PALETTE.projectile }));
	const matStar = trackMaterial(
		new MeshBasicMaterial({
			color: PALETTE.star,
			transparent: true,
			opacity: 1,
			side: DoubleSide,
		}),
	);
	const confettiColors = [
		PALETTE.confettiA,
		PALETTE.confettiB,
		PALETTE.confettiC,
		PALETTE.confettiD,
		PALETTE.confettiE,
	] as const;
	const matConfetti = confettiColors.map((c) =>
		trackMaterial(
			new MeshBasicMaterial({ color: c, transparent: true, opacity: 1, side: DoubleSide }),
		),
	);

	function applyMaterials(): void {
		// Saturated indigo board with a candy-orange path strip on top —
		// flat, bold, and high-contrast against the neon dynamic objects.
		ctx.ground.visible = true;
		const groundMat = new MeshBasicMaterial({ color: PALETTE.ground });
		ownedMaterials.push(groundMat);
		ctx.ground.material = groundMat;
		ctx.scene.background = new Color(PALETTE.bgClear);
		try {
			ctx.renderer.setClearColor?.(PALETTE.bgClear, 1);
		} catch {
			// renderer is a stub in tests; ignore
		}

		const pathMat = trackMaterial(new MeshBasicMaterial({ color: PALETTE.path }));
		for (let i = 1; i < PATH.length; i++) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) continue;
			const dx = b.x - a.x;
			const dz = b.y - a.y;
			const len = Math.hypot(dx, dz);
			if (len === 0) continue;
			const geo = new BoxGeometry(len, 0.5, 38);
			const mesh = new Mesh(geo, pathMat);
			mesh.position.set((a.x + b.x) / 2, 0.4, (a.y + b.y) / 2);
			mesh.rotation.y = -Math.atan2(dz, dx);
			staticGroup.add(mesh);
		}

		// Arcade-gold slot rims. Filled cylinders (no toon shading) so they
		// read as flat coin-drop tokens.
		const slotMat = trackMaterial(new MeshBasicMaterial({ color: PALETTE.slot }));
		for (const slot of BUILD_SLOTS) {
			const ring = new Mesh(
				new CylinderGeometry(BUILD_SLOT_RADIUS, BUILD_SLOT_RADIUS, 0.5, 28),
				slotMat,
			);
			ring.position.set(slot.x, 0.5, slot.y);
			staticGroup.add(ring);
		}
	}

	function setupLighting(): void {
		// Flat lighting / no shadows: a strong ambient base + a soft top-down
		// directional just to keep faces from going pure-color flat. Toon
		// banding handles the rest.
		const ambient = new AmbientLight(0xffffff, 0.85);
		ctx.scene.add(ambient);
		lights.push(ambient);

		const fill = new DirectionalLight(0xffffff, 0.4);
		fill.position.set(CANVAS_WIDTH / 2, 800, CANVAS_HEIGHT / 2);
		fill.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
		// AC: no shadows — DirectionalLight defaults to castShadow=false, but
		// be explicit so a future scene tweak can't accidentally re-enable it.
		fill.castShadow = false;
		ctx.scene.add(fill);
		ctx.scene.add(fill.target);
		lights.push(fill);
	}

	function setupPostprocess(): void {
		// Per design doc: outline pass is visual, not motion — keep it on
		// even when `prefers-reduced-motion` is set. Reduced-motion behavior
		// is handled in the CSS keyframes (HUD pop / wheel spin collapse).
		try {
			const gl = (ctx.renderer as unknown as { getContext?: () => unknown }).getContext?.();
			if (!gl) return;
			const c = new EffectComposer(ctx.renderer);
			c.addPass(new RenderPass(ctx.scene, ctx.camera));

			// AC: outline pass is the only postprocess. Selected objects are
			// refreshed every frame from `dynamicGroup.children` so newly
			// spawned enemies / towers / projectiles get outlined too.
			const outline = new OutlinePass(
				new Vector2(CANVAS_WIDTH, CANVAS_HEIGHT),
				ctx.scene,
				ctx.camera,
			);
			outline.edgeStrength = 6;
			outline.edgeGlow = 0;
			outline.edgeThickness = 2;
			outline.pulsePeriod = 0;
			outline.visibleEdgeColor.set(0x000000);
			outline.hiddenEdgeColor.set(0x000000);
			c.addPass(outline);

			c.addPass(new OutputPass());
			composer = c;
			outlinePass = outline;
		} catch {
			composer = null;
			outlinePass = null;
		}
	}

	function mountHud(): void {
		ensureStyleTag();
		const hudEl =
			(ctx.hud.gold.closest?.("#hud") as HTMLElement | null) ??
			(ctx.hud.gold.parentElement?.parentElement as HTMLElement | null) ??
			null;
		if (hudEl) {
			hudEl.classList.add("variant-c-hud");
			hudRootEl = hudEl;
		}
		const stats = hudEl?.querySelectorAll<HTMLElement>(".stat") ?? [];
		for (const el of Array.from(stats)) el.classList.add("variant-c-bubble");
		const values = hudEl?.querySelectorAll<HTMLElement>(".value") ?? [];
		for (const el of Array.from(values)) el.classList.add("variant-c-value");
	}

	function mountBuildMenu(): void {
		ensureStyleTag();
		ctx.menu.classList.add("variant-c-wheel");
	}

	function ensureStyleTag(): void {
		if (typeof document === "undefined") return;
		if (document.getElementById(STYLE_TAG_ID)) return;
		const tag = document.createElement("style");
		tag.id = STYLE_TAG_ID;
		tag.textContent = ARCADE_CSS;
		document.head.appendChild(tag);
	}

	function makeInstance(key: ModelKey, models: ModelMap): Object3D {
		const tpl = models.get(key);
		const node = tpl ? tpl.clone(true) : makePrimitive(key);
		// Toon repaint over Kenney meshes: every child mesh adopts the toon
		// material for its key, so the outline pass has a consistent flat
		// silhouette to trace.
		const mat = matForKey(key);
		node.traverse((child) => {
			const mesh = child as Mesh;
			if (mesh.isMesh) {
				mesh.material = mat;
			}
		});
		return node;
	}

	function matForKey(key: ModelKey): Material {
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
				mesh = makeInstance(key, ctx.models);
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
				mesh = makeInstance("projectile", ctx.models);
				cache.projectiles.set(e, mesh);
				dynamicGroup.add(mesh);
			}
			mesh.position.set(proj.x, MODEL_HEIGHT.projectile, proj.y);
		}
		evictDead(cache.projectiles, live, dynamicGroup);
	}

	function spawnConfetti(x: number, y: number, count: number, life: number): void {
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 80 + Math.random() * 180;
			const matIdx = Math.floor(Math.random() * matConfetti.length);
			const mat = matConfetti[matIdx] ?? matConfetti[0];
			if (!mat) continue;
			// Thin spinning rectangle. Width vs height differs by a factor of
			// 2-3 so the confetti reads as a streak when rotating.
			const w = 2.4 + Math.random() * 1.4;
			const h = 5.5 + Math.random() * 2.5;
			const piece = new Mesh(new BoxGeometry(w, 0.4, h), mat);
			piece.position.set(x, 6 + Math.random() * 4, y);
			piece.rotation.y = Math.random() * Math.PI * 2;
			piece.rotation.z = Math.random() * Math.PI;
			sparksGroup.add(piece);
			sparks.push({
				mesh: piece,
				kind: "confetti",
				vx: Math.cos(angle) * speed,
				vy: 80 + Math.random() * 90,
				vz: Math.sin(angle) * speed,
				spin: 8 + Math.random() * 14,
				life,
				age: 0,
			});
		}
	}

	function spawnStars(x: number, y: number, count: number, life: number): void {
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 40 + Math.random() * 110;
			const star = new Mesh(starGeometry(3.6 + Math.random() * 2.4), matStar);
			// Lay flat on the canvas so the star pop reads from the camera.
			star.rotation.x = -Math.PI / 2;
			star.rotation.z = Math.random() * Math.PI * 2;
			star.position.set(x, 8 + Math.random() * 4, y);
			sparksGroup.add(star);
			sparks.push({
				mesh: star,
				kind: "star",
				vx: Math.cos(angle) * speed,
				vy: 40 + Math.random() * 50,
				vz: Math.sin(angle) * speed,
				spin: 4 + Math.random() * 8,
				life,
				age: 0,
			});
		}
	}

	function spawnParticles(event: ParticleEvent): void {
		// AC: confetti + comic-book stars on every hit. Counts/lives vary by
		// kind so a muzzle flash reads quieter than an explosion or death.
		switch (event.kind) {
			case "muzzle":
				spawnConfetti(event.x, event.y, 6, 0.45);
				spawnStars(event.x, event.y, 2, 0.35);
				break;
			case "impact":
				spawnConfetti(event.x, event.y, 10, 0.55);
				spawnStars(event.x, event.y, 4, 0.45);
				break;
			case "explosion":
				spawnConfetti(event.x, event.y, 18, 0.8);
				spawnStars(event.x, event.y, 8, 0.65);
				break;
			case "death":
				spawnConfetti(event.x, event.y, 14, 0.7);
				spawnStars(event.x, event.y, 6, 0.55);
				break;
		}
	}

	function updateSparks(dt: number): void {
		const gravity = -300; // px/s² down — confetti falls just fast enough to feel weighty
		const drag = 1.6;
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
			if (s.mesh.position.y < 1) {
				s.mesh.position.y = 1;
				s.vy = Math.abs(s.vy) * 0.25;
				s.vx *= 0.6;
				s.vz *= 0.6;
			}
			const remaining = 1 - s.age / s.life;
			if (s.kind === "confetti") {
				s.mesh.rotation.x += dt * s.spin;
				s.mesh.rotation.z += dt * s.spin * 0.6;
			} else {
				// Stars pop up to 1.4× then shrink to 0 — comic-book "ka-pow".
				const t = s.age / s.life;
				const popPhase = t < 0.25 ? t / 0.25 : 1;
				const fadePhase = t > 0.4 ? Math.max(0, 1 - (t - 0.4) / 0.6) : 1;
				const scale = popPhase * 1.4 * fadePhase + 0.001;
				s.mesh.scale.setScalar(scale);
				s.mesh.rotation.z += dt * s.spin;
			}
			// Fade-out for confetti so they don't pop out of existence.
			if (s.kind === "confetti" && remaining < 0.4) {
				s.mesh.scale.setScalar(Math.max(0.01, remaining / 0.4));
			}
		}
	}

	listener = (e: ParticleEffect) => spawnParticles(e);
	setParticleEffectListener(listener);

	return {
		id: "C",
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
			// Refresh the outline target list each frame — dynamic spawns/
			// despawns (towers, enemies, projectiles) need to be in scope.
			if (outlinePass) {
				outlinePass.selectedObjects = dynamicGroup.children.slice();
			}
		},
		render() {
			if (composer) composer.render();
			else ctx.renderer.render(ctx.scene, ctx.camera);
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
			sparks.length = 0;
			composer?.dispose?.();
			outlinePass?.dispose?.();
			outlinePass = null;
			if (typeof document !== "undefined") {
				document.getElementById(STYLE_TAG_ID)?.remove();
				ctx.menu.classList.remove("variant-c-wheel");
				if (hudRootEl) {
					hudRootEl.classList.remove("variant-c-hud");
					for (const el of Array.from(
						hudRootEl.querySelectorAll<HTMLElement>(".variant-c-bubble"),
					)) {
						el.classList.remove("variant-c-bubble");
					}
					for (const el of Array.from(
						hudRootEl.querySelectorAll<HTMLElement>(".variant-c-value"),
					)) {
						el.classList.remove("variant-c-value");
					}
				}
			}
		},
	};
}

// 4-step toon ramp: classic recipe — a 1-channel LUT sampled by the toon
// shader to band lit vs. shadowed regions. Returns null when DataTexture
// can't be constructed in the test environment.
function makeToonGradient(): Texture | null {
	try {
		const data = new Uint8Array([0x55, 0x99, 0xcc, 0xff]);
		const tex = new DataTexture(data, data.length, 1, RedFormat);
		tex.minFilter = NearestFilter;
		tex.magFilter = NearestFilter;
		tex.generateMipmaps = false;
		tex.needsUpdate = true;
		return tex;
	} catch {
		return null;
	}
}

// 5-point star — outer/inner radius alternation. Built once per spark since
// the geometry varies by spawn size; cheap because each star is ~10 verts.
function starGeometry(outer: number): ShapeGeometry {
	const inner = outer * 0.42;
	const shape = new Shape();
	for (let i = 0; i < 10; i++) {
		const angle = (i * Math.PI) / 5 - Math.PI / 2;
		const r = i % 2 === 0 ? outer : inner;
		const x = Math.cos(angle) * r;
		const y = Math.sin(angle) * r;
		if (i === 0) shape.moveTo(x, y);
		else shape.lineTo(x, y);
	}
	shape.closePath();
	return new ShapeGeometry(shape);
}

function evictDead(map: Map<Entity, Object3D>, live: Set<Entity>, parent: Group): void {
	for (const [entity, mesh] of map) {
		if (!live.has(entity)) {
			parent.remove(mesh);
			map.delete(entity);
		}
	}
}

const ARCADE_FONT_FAMILY = '"Fredoka","Baloo 2","Comic Sans MS",system-ui,sans-serif';
const COLOR_INK = "#1a0d2a";
const COLOR_PAPER = "#fff8e8";
const COLOR_MAGENTA = "#ff3df5";
const COLOR_LIME = "#7cff5c";
const COLOR_CYAN = "#5ce1ff";
const COLOR_GOLD = "#ffe93d";

// CSS injected once at mount time. Drives the speech-bubble HUD with
// squash/stretch + the radial-wheel build menu rotating around the slot.
// Reduced-motion users get the open state without the bounce.
const ARCADE_CSS = `
@keyframes variant-c-bubble-pop {
	0% { transform: scale(0.35) translateY(-10px); opacity: 0; }
	55% { transform: scale(1.18, 0.85) translateY(0); opacity: 1; }
	75% { transform: scale(0.92, 1.08); }
	100% { transform: scale(1, 1); }
}
@keyframes variant-c-wheel-spin {
	0% { transform: rotate(-180deg) scale(0.3); opacity: 0; }
	60% { transform: rotate(20deg) scale(1.12); opacity: 1; }
	80% { transform: rotate(-8deg) scale(0.96); }
	100% { transform: rotate(0deg) scale(1); }
}
@keyframes variant-c-value-thump {
	0%, 100% { transform: scale(1, 1); }
	30% { transform: scale(1.22, 0.82); }
	60% { transform: scale(0.92, 1.12); }
}
#hud.variant-c-hud {
	background: ${COLOR_PAPER} !important;
	border: 3px solid ${COLOR_INK} !important;
	box-shadow:
		4px 4px 0 ${COLOR_INK},
		inset 0 -3px 0 rgba(0, 0, 0, 0.08) !important;
	border-radius: 22px !important;
	padding: 10px 14px !important;
	gap: 12px !important;
	font-family: ${ARCADE_FONT_FAMILY} !important;
}
#hud.variant-c-hud .stat.variant-c-bubble {
	background: ${COLOR_GOLD} !important;
	border: 2px solid ${COLOR_INK} !important;
	border-radius: 18px !important;
	padding: 4px 12px !important;
	box-shadow: 2px 2px 0 ${COLOR_INK} !important;
	animation: variant-c-bubble-pop ${HUD_BOUNCE_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
	transform-origin: center center;
}
#hud.variant-c-hud .stat.variant-c-bubble:nth-child(2) {
	background: ${COLOR_LIME} !important;
	animation-delay: 60ms;
}
#hud.variant-c-hud .stat.variant-c-bubble:nth-child(3) {
	background: ${COLOR_CYAN} !important;
	animation-delay: 120ms;
}
#hud.variant-c-hud .stat .label {
	color: ${COLOR_INK} !important;
	font-family: ${ARCADE_FONT_FAMILY} !important;
	font-weight: 700 !important;
	letter-spacing: 0.04em !important;
	text-transform: uppercase !important;
}
#hud.variant-c-hud .stat .value.variant-c-value {
	color: ${COLOR_INK} !important;
	font-family: ${ARCADE_FONT_FAMILY} !important;
	font-weight: 800 !important;
	font-size: 16px !important;
	display: inline-block !important;
	transform-origin: center center;
	animation: variant-c-value-thump 220ms ease-out 1;
}
#build-menu.variant-c-wheel {
	background: ${COLOR_PAPER} !important;
	border: 3px solid ${COLOR_INK} !important;
	box-shadow:
		5px 5px 0 ${COLOR_INK},
		inset 0 -4px 0 rgba(0, 0, 0, 0.08) !important;
	color: ${COLOR_INK} !important;
	font-family: ${ARCADE_FONT_FAMILY} !important;
	border-radius: 28px !important;
	padding: 14px !important;
	min-width: 230px !important;
	transform-origin: 0% 100%;
}
#build-menu.variant-c-wheel.open {
	animation: variant-c-wheel-spin ${MENU_WHEEL_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
#build-menu.variant-c-wheel .menu-header {
	color: ${COLOR_INK} !important;
	background: ${COLOR_MAGENTA} !important;
	border: 2px solid ${COLOR_INK} !important;
	border-radius: 14px !important;
	padding: 4px 10px !important;
	margin-bottom: 8px !important;
	font-weight: 800 !important;
	text-align: center;
	letter-spacing: 0.04em;
}
#build-menu.variant-c-wheel .tower-btn {
	background: ${COLOR_PAPER} !important;
	border: 2px solid ${COLOR_INK} !important;
	border-radius: 16px !important;
	color: ${COLOR_INK} !important;
	font-family: ${ARCADE_FONT_FAMILY} !important;
	font-weight: 600 !important;
	box-shadow: 2px 2px 0 ${COLOR_INK} !important;
	transition: transform 90ms ease-out;
}
#build-menu.variant-c-wheel .tower-btn:hover:not(.disabled) {
	background: ${COLOR_GOLD} !important;
	transform: translate(-1px, -1px) !important;
	box-shadow: 3px 3px 0 ${COLOR_INK} !important;
}
#build-menu.variant-c-wheel .tower-btn.disabled {
	opacity: 0.55 !important;
	box-shadow: 1px 1px 0 ${COLOR_INK} !important;
}
#build-menu.variant-c-wheel .tower-name {
	color: ${COLOR_INK} !important;
	font-weight: 800 !important;
}
#build-menu.variant-c-wheel .tower-cost {
	color: ${COLOR_MAGENTA} !important;
	font-weight: 700 !important;
}
#build-menu.variant-c-wheel .tower-cost.maxed {
	color: ${COLOR_LIME} !important;
}
#build-menu.variant-c-wheel .tower-stats {
	color: ${COLOR_INK} !important;
	opacity: 0.85;
}
#build-menu.variant-c-wheel .invested {
	color: ${COLOR_INK} !important;
	opacity: 0.65;
}
#build-menu.variant-c-wheel .menu-close {
	background: ${COLOR_CYAN} !important;
	border: 2px solid ${COLOR_INK} !important;
	border-radius: 14px !important;
	color: ${COLOR_INK} !important;
	font-weight: 700 !important;
	box-shadow: 2px 2px 0 ${COLOR_INK} !important;
}
@media (prefers-reduced-motion: reduce) {
	#hud.variant-c-hud .stat.variant-c-bubble { animation: none; }
	#hud.variant-c-hud .stat .value.variant-c-value { animation: none; }
	#build-menu.variant-c-wheel.open { animation: none; }
}
`;
