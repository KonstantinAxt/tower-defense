import { loadSprites } from "./assets/loader";
import { SystemRunner, World } from "./ecs";
import { movementSystem, renderEnemies } from "./enemies";
import { Loop } from "./loop";
import { renderScene } from "./render/scene";
import { projectileSystem, renderProjectiles, renderTowers, towerSystem } from "./towers";
import { attachUI, clearSelection, getSelectedSlot, updateHud } from "./ui";
import { TOTAL_WAVES, WaveController } from "./waves";

const STARTING_LIVES = 20;
const STARTING_GOLD = 250;

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

const waveButton = requireEl("#wave-button") as HTMLButtonElement;
const pauseButton = requireEl("#pause-button") as HTMLButtonElement;
const winModal = requireEl("#win-modal");
const loseModal = requireEl("#lose-modal");

function requireEl(selector: string): HTMLElement {
	const el = document.querySelector<HTMLElement>(selector);
	if (!el) throw new Error(`${selector} not found`);
	return el;
}

function resetWorld(world: World): void {
	world.reset();
	world.lives = STARTING_LIVES;
	world.gold = STARTING_GOLD;
	world.wave = 1;
}

async function boot(
	ctx2d: CanvasRenderingContext2D,
	canvasEl: HTMLCanvasElement,
	menuEl: HTMLElement,
): Promise<void> {
	const sprites = await loadSprites();
	const world = new World();
	resetWorld(world);

	const controller = new WaveController();

	const systems = new SystemRunner();
	systems.add((w, dt) => controller.update(w, dt));
	systems.add(movementSystem);
	systems.add(towerSystem);
	systems.add(projectileSystem);

	attachUI({ canvas: canvasEl, menu: menuEl, hud, world });

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		(_alpha) => {
			renderScene(ctx2d, sprites);
			renderTowers(ctx2d, world, sprites, getSelectedSlot());
			renderProjectiles(ctx2d, world, sprites);
			renderEnemies(ctx2d, world, sprites);
			updateHud(hud, world);
			updateControls();
		},
		{ fixedDt: 1 / 60 },
	);

	function updateControls(): void {
		const canStart = controller.canStart();
		waveButton.disabled = !canStart;
		waveButton.textContent =
			controller.currentWave > TOTAL_WAVES
				? "Complete"
				: controller.state === "spawning" || controller.state === "clearing"
					? `Wave ${controller.currentWave}…`
					: `Start Wave ${controller.currentWave}`;
		pauseButton.textContent = loop.isPaused() ? "Resume" : "Pause";

		toggleModal(winModal, controller.state === "won");
		toggleModal(loseModal, controller.state === "lost");
	}

	waveButton.addEventListener("click", () => {
		if (controller.canStart()) {
			controller.startWave(world);
			clearSelection(menuEl);
		}
	});

	pauseButton.addEventListener("click", () => {
		if (loop.isPaused()) loop.resume();
		else loop.pause();
		updateControls();
	});

	const restart = (): void => {
		resetWorld(world);
		controller.restart();
		clearSelection(menuEl);
		if (loop.isPaused()) loop.resume();
		updateControls();
	};

	winModal.addEventListener("click", (e) => {
		if ((e.target as HTMLElement).dataset.action === "restart") restart();
	});
	loseModal.addEventListener("click", (e) => {
		if ((e.target as HTMLElement).dataset.action === "restart") restart();
	});

	const tick = (nowMs: number): void => {
		loop.step(nowMs);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

function toggleModal(modal: HTMLElement, open: boolean): void {
	if (open) modal.classList.add("open");
	else modal.classList.remove("open");
}

void boot(ctx, canvas, menu);
