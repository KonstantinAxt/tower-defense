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
import { createArcadeVariant } from "./c-arcade";
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

describe("createArcadeVariant", () => {
	test("registers as 'C' in the default registry without dethroning A", () => {
		const registry = createDefaultRegistry({ warn: () => {} });
		expect(registry.has("C")).toBe(true);
		// Default is still A; C activates only via ?ui=C.
		expect(registry.resolve(null)).toBe("A");
		expect(registry.resolve("C")).toBe("C");
	});

	test("attaches an arcade root group and tracks ECS state", () => {
		const ctx = makeContext();
		const variant = createArcadeVariant(ctx);
		expect(variant.id).toBe("C");

		const world = new World();
		spawnEnemy(world, "fast");
		variant.update(world);

		let foundRoot: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "c-arcade-root") foundRoot = obj;
		});
		expect(foundRoot).not.toBeNull();

		variant.dispose();
		let stillThere = false;
		ctx.scene.traverse((obj) => {
			if (obj.name === "c-arcade-root") stillThere = true;
		});
		expect(stillThere).toBe(false);
	});

	test("declares all chrome hooks including outline postprocess + custom render", () => {
		const ctx = makeContext();
		const variant = createArcadeVariant(ctx);
		expect(typeof variant.applyMaterials).toBe("function");
		expect(typeof variant.setupLighting).toBe("function");
		// AC: outline pass is the only postprocess.
		expect(typeof variant.setupPostprocess).toBe("function");
		expect(typeof variant.mountHud).toBe("function");
		expect(typeof variant.mountBuildMenu).toBe("function");
		expect(typeof variant.spawnParticles).toBe("function");
		// `render` is required so the host invokes the EffectComposer when
		// setupPostprocess installed one. Falls back to renderer.render
		// when the composer can't initialize (test stub).
		expect(typeof variant.render).toBe("function");

		variant.applyMaterials?.();
		variant.setupLighting?.();
		variant.setupPostprocess?.();
		variant.mountHud?.();
		variant.mountBuildMenu?.();
		variant.render?.();

		variant.dispose();
	});

	test("setupLighting adds flat ambient + directional fill, no shadow caster", () => {
		const ctx = makeContext();
		const variant = createArcadeVariant(ctx);
		variant.setupLighting?.();
		let directional = 0;
		let ambient = 0;
		let shadowCasters = 0;
		ctx.scene.traverse((obj) => {
			if (obj.type === "DirectionalLight") {
				directional++;
				const dl = obj as unknown as { castShadow?: boolean };
				if (dl.castShadow) shadowCasters++;
			}
			if (obj.type === "AmbientLight") ambient++;
		});
		expect(directional).toBe(1);
		expect(ambient).toBe(1);
		// AC: no shadows.
		expect(shadowCasters).toBe(0);
		variant.dispose();
	});

	test("subscribes to particle events: emitImpact spawns confetti + stars under the arcade root", () => {
		const ctx = makeContext();
		const variant = createArcadeVariant(ctx);

		emitImpact(120, 220);

		let sparkParent: Object3D | null = null;
		ctx.scene.traverse((obj) => {
			if (obj.name === "sparks") sparkParent = obj;
		});
		expect(sparkParent).not.toBeNull();
		// Impact = 10 confetti + 4 stars = 14 children.
		expect((sparkParent as unknown as Object3D).children.length).toBeGreaterThanOrEqual(14);

		variant.dispose();
	});
});
