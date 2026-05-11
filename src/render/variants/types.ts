import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { ModelMap } from "../../assets/loader3d";
import type { World } from "../../ecs";

export type VariantId = "A" | "B" | "C" | "neutral";

// HUD root elements the active variant may decorate. Mirrors the shape used by
// `attachUI` in `src/ui.ts` so a variant can read live values or wrap them in
// extra chrome without re-querying the DOM.
export interface VariantHud {
	readonly gold: HTMLElement;
	readonly lives: HTMLElement;
	readonly wave: HTMLElement;
}

// A particle event is emitted by gameplay code (towers firing, enemies dying,
// projectiles impacting) so each variant can render it however it likes — 2D
// canvas overlay, GPU sprites, mesh bursts, etc.
export type ParticleEvent =
	| { readonly kind: "muzzle"; readonly x: number; readonly y: number }
	| { readonly kind: "impact"; readonly x: number; readonly y: number }
	| { readonly kind: "explosion"; readonly x: number; readonly y: number }
	| { readonly kind: "death"; readonly x: number; readonly y: number };

// Everything a variant needs to wire itself into the running game. Passed once
// into the factory at boot; variants stash references they need internally.
export interface VariantContext {
	readonly scene: Scene;
	readonly renderer: WebGLRenderer;
	readonly camera: PerspectiveCamera;
	readonly canvas: HTMLCanvasElement;
	readonly hud: VariantHud;
	readonly menu: HTMLElement;
	readonly models: ModelMap;
}

// A `VariantModule` is the shape A/B/C and `neutral` all conform to. The
// optional hooks are extension points each variant can opt into — `neutral`
// is intentionally minimal and only implements `update`/`dispose`. `update`
// is called every render frame with the latest world state; `dispose` tears
// down anything the variant attached to the scene/DOM.
export interface VariantModule {
	readonly id: VariantId;
	applyMaterials?(): void;
	setupLighting?(): void;
	setupPostprocess?(): void;
	mountHud?(): void;
	mountBuildMenu?(): void;
	spawnParticles?(event: ParticleEvent): void;
	update(world: World): void;
	dispose(): void;
}

export type VariantFactory = (ctx: VariantContext) => VariantModule;
