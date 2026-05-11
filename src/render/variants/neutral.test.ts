import { describe, expect, test } from "bun:test";
import { PerspectiveCamera, Scene, type WebGLRenderer } from "three";
import type { ModelMap } from "../../assets/loader3d";
import { World } from "../../ecs";
import { spawnEnemy } from "../../enemies";
import { createDefaultRegistry } from "./index";
import type { VariantContext } from "./types";

const EMPTY_MODELS: ModelMap = new Map();

function makeContext(): VariantContext {
	const scene = new Scene();
	const camera = new PerspectiveCamera();
	const canvas = { addEventListener: () => {} } as unknown as HTMLCanvasElement;
	const hud = {
		gold: { textContent: "" } as unknown as HTMLElement,
		lives: { textContent: "" } as unknown as HTMLElement,
		wave: { textContent: "" } as unknown as HTMLElement,
	};
	const menu = {} as HTMLElement;
	// WebGLRenderer construction needs a WebGL context which Bun's headless
	// jsdom-less environment lacks; cast a minimal stub since the neutral
	// variant never reads from it.
	const renderer = {} as unknown as WebGLRenderer;
	return { scene, camera, canvas, hud, menu, renderer, models: EMPTY_MODELS };
}

describe("neutral variant via default registry", () => {
	test("default registry exposes neutral and resolves it as fallback", () => {
		const registry = createDefaultRegistry({ warn: () => {} });
		expect(registry.has("neutral")).toBe(true);
		expect(registry.resolve(null)).toBe("neutral");
	});

	test("neutral variant attaches the renderer root and tracks ECS state", () => {
		const registry = createDefaultRegistry({ warn: () => {} });
		const ctx = makeContext();
		const variant = registry.create("neutral", ctx);
		expect(variant.id).toBe("neutral");

		const world = new World();
		world.lives = 20;
		spawnEnemy(world, "fast");
		variant.update(world);

		let foundRoot = false;
		ctx.scene.traverse((obj) => {
			if (obj.name === "neutral-renderer") foundRoot = true;
		});
		expect(foundRoot).toBe(true);

		variant.dispose();
		let stillThere = false;
		ctx.scene.traverse((obj) => {
			if (obj.name === "neutral-renderer") stillThere = true;
		});
		expect(stillThere).toBe(false);
	});
});
