import { loadSprites } from "./assets/loader";
import { attachAutoResume, play, setMuted } from "./audio";
import { SystemRunner, World } from "./ecs";
import { movementSystem, renderEnemies } from "./enemies";
import { Loop } from "./loop";
import { clearParticles, renderParticles, updateParticles } from "./particles";
import { renderScene } from "./render/scene";
import { type StorageLike, deserialize, loadFromStorage, saveToStorage, serialize } from "./save";
import {
	C_TOWER,
	type Tower,
	projectileSystem,
	renderProjectiles,
	renderTowers,
	towerSystem,
	towerUpgradeCost,
	upgradeTower,
} from "./towers";
import { attachUI, clearSelection, getSelectedSlot, updateHud } from "./ui";
import { TOTAL_WAVES, WaveController, type WaveState } from "./waves";

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
const saveButton = requireEl("#save-button") as HTMLButtonElement;
const loadButton = requireEl("#load-button") as HTMLButtonElement;
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
	let lastWaveState: WaveState = controller.state;

	attachAutoResume(window);

	const storage: StorageLike | null =
		typeof localStorage !== "undefined" ? (localStorage as StorageLike) : null;

	controller.onCleared = () => {
		if (!storage) return;
		saveToStorage(serialize(world, controller), storage);
	};

	const systems = new SystemRunner();
	systems.add((w, dt) => controller.update(w, dt));
	systems.add(movementSystem);
	systems.add(towerSystem);
	systems.add(projectileSystem);
	systems.add((_w, dt) => updateParticles(dt));

	attachUI({ canvas: canvasEl, menu: menuEl, hud, world });

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		(_alpha) => {
			renderScene(ctx2d, sprites);
			renderTowers(ctx2d, world, sprites, getSelectedSlot());
			renderProjectiles(ctx2d, world, sprites);
			renderEnemies(ctx2d, world, sprites);
			renderParticles(ctx2d);
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

		const betweenWaves = controller.state === "idle" && controller.currentWave <= TOTAL_WAVES;
		saveButton.disabled = !storage || !betweenWaves;
		loadButton.disabled = !storage || !betweenWaves || loadFromStorage(storage) === null;

		toggleModal(winModal, controller.state === "won");
		toggleModal(loseModal, controller.state === "lost");

		if (controller.state !== lastWaveState) {
			if (controller.state === "won") play("win");
			else if (controller.state === "lost") play("lose");
			lastWaveState = controller.state;
		}
	}

	waveButton.addEventListener("click", () => {
		if (controller.canStart()) {
			controller.startWave(world);
			clearSelection(menuEl);
			lastWaveState = controller.state;
			play("waveStart");
		}
	});

	pauseButton.addEventListener("click", () => {
		if (loop.isPaused()) {
			loop.resume();
			setMuted(false);
		} else {
			loop.pause();
			setMuted(true);
		}
		updateControls();
	});

	saveButton.addEventListener("click", () => {
		if (!storage) return;
		if (controller.state !== "idle" || controller.currentWave > TOTAL_WAVES) return;
		saveToStorage(serialize(world, controller), storage);
		updateControls();
	});

	loadButton.addEventListener("click", () => {
		if (!storage) return;
		if (controller.state !== "idle" || controller.currentWave > TOTAL_WAVES) return;
		const snap = loadFromStorage(storage);
		if (!snap) return;
		deserialize(world, controller, snap);
		clearSelection(menuEl);
		updateControls();
	});

	const restart = (): void => {
		resetWorld(world);
		controller.restart();
		clearParticles();
		clearSelection(menuEl);
		if (loop.isPaused()) {
			loop.resume();
			setMuted(false);
		}
		lastWaveState = controller.state;
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

	if (import.meta.env.DEV) {
		(window as unknown as { __td: TestHandle }).__td = {
			world,
			controller,
			loop,
			restart,
			startWave: () => {
				if (controller.canStart()) {
					controller.startWave(world);
					clearSelection(menuEl);
					lastWaveState = controller.state;
				}
			},
			upgradeAffordable: () => {
				let count = 0;
				for (const e of world.query(C_TOWER)) {
					const tower = world.getComponent<Tower>(e, C_TOWER);
					if (!tower) continue;
					const cost = towerUpgradeCost(tower);
					if (cost === null || world.gold < cost) continue;
					if (upgradeTower(world, e)) count++;
				}
				return count;
			},
		};
	}
}

interface TestHandle {
	world: World;
	controller: WaveController;
	loop: Loop;
	restart: () => void;
	startWave: () => void;
	upgradeAffordable: () => number;
}

function toggleModal(modal: HTMLElement, open: boolean): void {
	if (open) modal.classList.add("open");
	else modal.classList.remove("open");
}

void boot(ctx, canvas, menu);
