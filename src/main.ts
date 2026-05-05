import { loadSprites } from "./assets/loader";
import { SystemRunner, World } from "./ecs";
import { movementSystem, renderEnemies, spawnEnemy } from "./enemies";
import { Loop } from "./loop";
import { renderScene } from "./render/scene";
import { projectileSystem, renderProjectiles, renderTowers, towerSystem } from "./towers";
import { attachUI, getSelectedSlot, updateHud } from "./ui";

const STARTING_LIVES = 20;
const STARTING_GOLD = 250;
const STARTING_WAVE = 1;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const menu = document.querySelector<HTMLElement>("#build-menu");
if (!menu) throw new Error("#build-menu not found");

const hud = {
	gold: requireEl("#hud-gold"),
	lives: requireEl("#hud-lives"),
	wave: requireEl("#hud-wave"),
};

function requireEl(selector: string): HTMLElement {
	const el = document.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`${selector} not found`);
	return el;
}

async function boot(
	ctx2d: CanvasRenderingContext2D,
	canvasEl: HTMLCanvasElement,
	menuEl: HTMLElement,
): Promise<void> {
	const sprites = await loadSprites();
	const world = new World();
	world.lives = STARTING_LIVES;
	world.gold = STARTING_GOLD;
	world.wave = STARTING_WAVE;

	const systems = new SystemRunner();
	systems.add(movementSystem);
	systems.add(towerSystem);
	systems.add(projectileSystem);

	// Seed a couple of enemies so the movement, targeting, and render paths
	// are visible before the wave system arrives.
	spawnEnemy(world, "fast");
	spawnEnemy(world, "heavy");

	attachUI({ canvas: canvasEl, menu: menuEl, hud, world });

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		(_alpha) => {
			renderScene(ctx2d, sprites);
			renderTowers(ctx2d, world, sprites, getSelectedSlot());
			renderProjectiles(ctx2d, world, sprites);
			renderEnemies(ctx2d, world, sprites);
			updateHud(hud, world);
		},
		{ fixedDt: 1 / 60 },
	);

	const tick = (nowMs: number): void => {
		loop.step(nowMs);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

void boot(ctx, canvas, menu);
