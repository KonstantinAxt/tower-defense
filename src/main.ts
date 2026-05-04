import { loadSprites } from "./assets/loader";
import { SystemRunner, World } from "./ecs";
import { Loop } from "./loop";
import { renderScene } from "./render/scene";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

async function boot(ctx2d: CanvasRenderingContext2D): Promise<void> {
	const sprites = await loadSprites();
	const world = new World();
	const systems = new SystemRunner();

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		(_alpha) => {
			renderScene(ctx2d, sprites);
		},
		{ fixedDt: 1 / 60 },
	);

	const tick = (nowMs: number): void => {
		loop.step(nowMs);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

void boot(ctx);
