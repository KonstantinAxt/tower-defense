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
import { createHolographicVariant } from "./a-holographic";
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
		// `getContext` returning `undefined` makes `setupPostprocess` bail
		// without trying to allocate render targets in the test environment.
		getContext: () => undefined,
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

describe("createHolographicVariant", () => {
	test("registers as 'A' and is the default in the default registry", () => {
		const registry = createDefaultRegistry({ warn: () => {} });
		expect(registry.has("A")).toBe(true);
		expect(registry.resolve(null)).toBe("A");
		expect(registry.resolve("A")).toBe("A");
	});

	test("attaches a holographic root group to the scene and tracks ECS state", () => {
		const ctx = makeContext();
		const variant = createHolographicVariant(ctx);
		expect(variant.id).toBe("A");

		const world = new World();
		spawnEnemy(world, "fast");
		variant.update(world);

		let foundRoot: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "a-holographic-root") foundRoot = obj;
		});
		expect(foundRoot).not.toBeNull();

		variant.dispose();
		let stillThere = false;
		ctx.scene.traverse((obj) => {
			if (obj.name === "a-holographic-root") stillThere = true;
		});
		expect(stillThere).toBe(false);
	});

	test("optional setup hooks run without throwing in a stub environment", () => {
		const ctx = makeContext();
		const variant = createHolographicVariant(ctx);
		// All optional hooks must be present per the AC.
		expect(typeof variant.applyMaterials).toBe("function");
		expect(typeof variant.setupLighting).toBe("function");
		expect(typeof variant.setupPostprocess).toBe("function");
		expect(typeof variant.mountHud).toBe("function");
		expect(typeof variant.mountBuildMenu).toBe("function");
		expect(typeof variant.spawnParticles).toBe("function");
		expect(typeof variant.render).toBe("function");

		variant.applyMaterials?.();
		variant.setupLighting?.();
		variant.setupPostprocess?.();
		variant.mountHud?.();
		variant.mountBuildMenu?.();
		// `render` falls back to renderer.render when no composer is set up.
		variant.render?.();

		variant.dispose();
	});

	test("subscribes to particle events: emitImpact spawns 3D sparks under the holo root", () => {
		const ctx = makeContext();
		const variant = createHolographicVariant(ctx);

		emitImpact(120, 220);

		let sparkParent: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "sparks") sparkParent = obj;
		});
		expect(sparkParent).not.toBeNull();
		expect((sparkParent as unknown as Object3D).children.length).toBeGreaterThan(0);

		variant.dispose();
	});
});
