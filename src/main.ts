import { loadSprites } from "./assets/loader";
import { SystemRunner, World } from "./ecs";
import { movementSystem, renderEnemies, spawnEnemy } from "./enemies";
import { Loop } from "./loop";
import { renderScene } from "./render/scene";

const STARTING_LIVES = 20;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

async function boot(ctx2d: CanvasRenderingContext2D): Promise<void> {
	const sprites = await loadSprites();
	const world = new World();
	world.lives = STARTING_LIVES;
	const systems = new SystemRunner();
	systems.add(movementSystem);

	// Seed a couple of enemies so the movement and render paths are visible
	// before the wave system arrives.
	spawnEnemy(world, "fast");
	spawnEnemy(world, "heavy");

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		(_alpha) => {
			renderScene(ctx2d, sprites);
			renderEnemies(ctx2d, world, sprites);
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
