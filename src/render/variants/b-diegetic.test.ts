import { afterEach, describe, expect, test } from "bun:test";
import {
	type Mesh,
	MeshBasicMaterial,
	type Object3D,
	PerspectiveCamera,
	Scene,
	type WebGLRenderer,
} from "three";
import type { ModelMap } from "../../assets/loader3d";
import { World } from "../../ecs";
import { spawnEnemy } from "../../enemies";
import { emitImpact, setParticleEffectListener } from "../../particles";
import { createDiegeticVariant } from "./b-diegetic";
import { createDefaultRegistry } from "./index";
import type { VariantContext } from "./types";

const EMPTY_MODELS: ModelMap = new Map();

function makeContext(): VariantContext {
	const scene = new Scene();
	const camera = new PerspectiveCamera();
	const canvas = { addEventListener: () => {} } as unknown as HTMLCanvasElement;
	const hud = {
		gold: { textContent: "", parentElement: null, closest: () => null } as unknown as HTMLElement,
		lives: {
			textContent: "",
			parentElement: null,
			closest: () => null,
		} as unknown as HTMLElement,
		wave: { textContent: "", parentElement: null, closest: () => null } as unknown as HTMLElement,
	};
	const menuClasses = new Set<string>();
	const menu = {
		classList: {
			add: (c: string) => menuClasses.add(c),
			remove: (c: string) => menuClasses.delete(c),
			contains: (c: string) => menuClasses.has(c),
		},
	} as unknown as HTMLElement;
	const renderer = {
		render: () => {},
		setClearColor: () => {},
	} as unknown as WebGLRenderer;
	const ground = {
		material: new MeshBasicMaterial(),
		visible: true,
	} as unknown as Mesh;
	return { scene, camera, canvas, hud, menu, renderer, models: EMPTY_MODELS, ground };
}

afterEach(() => {
	setParticleEffectListener(null);
});

describe("createDiegeticVariant", () => {
	test("registers as 'B' in the default registry without dethroning A", () => {
		const registry = createDefaultRegistry({ warn: () => {} });
		expect(registry.has("B")).toBe(true);
		// Default is still A; B activates only via ?ui=B.
		expect(registry.resolve(null)).toBe("A");
		expect(registry.resolve("B")).toBe("B");
	});

	test("attaches a diegetic root group and tracks ECS state", () => {
		const ctx = makeContext();
		const variant = createDiegeticVariant(ctx);
		expect(variant.id).toBe("B");

		const world = new World();
		spawnEnemy(world, "fast");
		variant.update(world);

		let foundRoot: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "b-diegetic-root") foundRoot = obj;
		});
		expect(foundRoot).not.toBeNull();

		variant.dispose();
		let stillThere = false;
		ctx.scene.traverse((obj) => {
			if (obj.name === "b-diegetic-root") stillThere = true;
		});
		expect(stillThere).toBe(false);
	});

	test("optional setup hooks present, and crucially no setupPostprocess (lighting carries the look)", () => {
		const ctx = makeContext();
		const variant = createDiegeticVariant(ctx);
		expect(typeof variant.applyMaterials).toBe("function");
		expect(typeof variant.setupLighting).toBe("function");
		expect(typeof variant.mountHud).toBe("function");
		expect(typeof variant.mountBuildMenu).toBe("function");
		expect(typeof variant.spawnParticles).toBe("function");
		// AC: "no postprocess".
		expect(variant.setupPostprocess).toBeUndefined();
		// No custom render hook either — falls through to threeScene.render.
		expect(variant.render).toBeUndefined();

		variant.applyMaterials?.();
		variant.setupLighting?.();
		variant.mountHud?.();
		variant.mountBuildMenu?.();
		variant.dispose();
	});

	test("setupLighting adds a warm directional sun + ambient fill", () => {
		const ctx = makeContext();
		const variant = createDiegeticVariant(ctx);
		variant.setupLighting?.();
		let directional = 0;
		let ambient = 0;
		ctx.scene.traverse((obj) => {
			if (obj.type === "DirectionalLight") directional++;
			if (obj.type === "AmbientLight") ambient++;
		});
		expect(directional).toBe(1);
		expect(ambient).toBe(1);
		variant.dispose();
		// Lights are removed on dispose so neutral/A can take over cleanly.
		let directionalAfter = 0;
		let ambientAfter = 0;
		ctx.scene.traverse((obj) => {
			if (obj.type === "DirectionalLight") directionalAfter++;
			if (obj.type === "AmbientLight") ambientAfter++;
		});
		expect(directionalAfter).toBe(0);
		expect(ambientAfter).toBe(0);
	});

	test("subscribes to particle events: emitImpact spawns smoke + brass shells under the diegetic root", () => {
		const ctx = makeContext();
		const variant = createDiegeticVariant(ctx);

		emitImpact(120, 220);

		let sparkParent: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "sparks") sparkParent = obj;
		});
		expect(sparkParent).not.toBeNull();
		// Impact = 5 smoke puffs + 3 shells = 8 children.
		expect((sparkParent as unknown as Object3D).children.length).toBeGreaterThanOrEqual(8);

		variant.dispose();
	});
});
