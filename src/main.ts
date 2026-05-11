import { loadModels } from "./assets/loader3d";
import { attachAutoResume, play, setMuted } from "./audio";
import { SystemRunner, World } from "./ecs";
import { movementSystem } from "./enemies";
import { Loop } from "./loop";
import { clearParticles, updateParticles } from "./particles";
import { createThreeScene } from "./render/three/scene";
import { createDefaultRegistry, readUiParam } from "./render/variants";
import {
	SAVE_KEY,
	type StorageLike,
	deserialize,
	loadFromStorage,
	saveToStorage,
	serialize,
} from "./save";
import {
	C_TOWER,
	type Tower,
	type TowerKind,
	buildTower,
	findTowerAtSlot,
	projectileSystem,
	towerSystem,
	towerUpgradeCost,
	upgradeTower,
} from "./towers";
import { attachUI, clearSelection, updateHud } from "./ui";
import { TOTAL_WAVES, WaveController, type WaveState } from "./waves";

const STARTING_LIVES = 20;
const STARTING_GOLD = 250;

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

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

async function boot(canvasEl: HTMLCanvasElement, menuEl: HTMLElement): Promise<void> {
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

	const threeScene = createThreeScene(canvasEl);
	const models = await loadModels();

	const registry = createDefaultRegistry();
	const requestedUi = typeof window !== "undefined" ? readUiParam(window.location.search) : null;
	const variantId = registry.resolve(requestedUi);
	const variant = registry.create(variantId, {
		scene: threeScene.scene,
		renderer: threeScene.renderer,
		camera: threeScene.camera,
		canvas: canvasEl,
		hud,
		menu: menuEl,
		models,
	});
	variant.applyMaterials?.();
	variant.setupLighting?.();
	variant.setupPostprocess?.();
	variant.mountHud?.();
	variant.mountBuildMenu?.();

	const uiController = attachUI({
		canvas: canvasEl,
		menu: menuEl,
		hud,
		world,
		pickPoint: (e) => threeScene.pickGroundFromEvent(e),
	});

	const loop = new Loop(
		(dt) => systems.run(world, dt),
		() => {
			variant.update(world);
			threeScene.render();
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
		const startWaveViaApi = (): boolean => {
			if (!controller.canStart()) return false;
			const ok = controller.startWave(world);
			if (ok) {
				clearSelection(menuEl);
				lastWaveState = controller.state;
				play("waveStart");
			}
			return ok;
		};
		const upgradeAffordable = (): number => {
			let count = 0;
			for (const e of world.query(C_TOWER)) {
				const tower = world.getComponent<Tower>(e, C_TOWER);
				if (!tower) continue;
				const cost = towerUpgradeCost(tower);
				if (cost === null || world.gold < cost) continue;
				if (upgradeTower(world, e)) count++;
			}
			return count;
		};
		// `window.__td.testApi` — state-based test surface for E2E.
		// Drives the game directly through gameplay code rather than synthetic
		// canvas/pointer events. Exposed only in dev builds.
		//
		// Methods:
		//   clickSlot(index)              — open the build/upgrade menu for a slot
		//   buyTower(slotIndex, kind)     — build a tower at a slot (returns ok)
		//   upgradeTowerAt(slotIndex)     — upgrade the tower at a slot (returns ok)
		//   closeMenu()                   — close the build menu
		//   startWave()                   — start the next wave (returns ok)
		//   pause() / resume() / isPaused()
		//   setSpeed(multiplier)          — time-acceleration hook (>0)
		//   getSpeed()
		//   save() / load() / clearSave()
		//   restart()
		//   upgradeAffordable()           — best-effort upgrade pass for autoplay
		//   getState()                    — snapshot of controller/world state
		const testApi: TestApi = {
			clickSlot(slotIndex) {
				uiController.selectSlot(slotIndex);
			},
			buyTower(slotIndex, kind) {
				const built = buildTower(world, kind, slotIndex);
				if (built !== null) {
					play("build");
					uiController.rerender();
					return true;
				}
				return false;
			},
			upgradeTowerAt(slotIndex) {
				const entity = findTowerAtSlot(world, slotIndex);
				if (entity === null) return false;
				const ok = upgradeTower(world, entity);
				if (ok) {
					play("upgrade");
					uiController.rerender();
				}
				return ok;
			},
			closeMenu() {
				uiController.closeMenu();
			},
			startWave: startWaveViaApi,
			pause() {
				if (!loop.isPaused()) {
					loop.pause();
					setMuted(true);
				}
			},
			resume() {
				if (loop.isPaused()) {
					loop.resume();
					setMuted(false);
				}
			},
			isPaused() {
				return loop.isPaused();
			},
			setSpeed(multiplier) {
				loop.setSpeed(multiplier);
			},
			getSpeed() {
				return loop.getSpeed();
			},
			save() {
				if (!storage) return false;
				if (controller.state !== "idle" || controller.currentWave > TOTAL_WAVES) return false;
				saveToStorage(serialize(world, controller), storage);
				return true;
			},
			load() {
				if (!storage) return false;
				if (controller.state !== "idle" || controller.currentWave > TOTAL_WAVES) return false;
				const snap = loadFromStorage(storage);
				if (!snap) return false;
				deserialize(world, controller, snap);
				clearSelection(menuEl);
				return true;
			},
			clearSave() {
				if (!storage) return;
				storage.removeItem(SAVE_KEY);
			},
			restart,
			upgradeAffordable,
			getState() {
				return {
					state: controller.state,
					currentWave: controller.currentWave,
					gold: world.gold,
					lives: world.lives,
					wave: world.wave,
					towers: world.query(C_TOWER).length,
				};
			},
		};

		(window as unknown as { __td: TestHandle }).__td = {
			world,
			controller,
			loop,
			restart,
			startWave: () => {
				startWaveViaApi();
			},
			upgradeAffordable,
			testApi,
		};
	}
}

interface TestApiState {
	state: WaveState;
	currentWave: number;
	gold: number;
	lives: number;
	wave: number;
	towers: number;
}

interface TestApi {
	clickSlot(slotIndex: number | null): void;
	buyTower(slotIndex: number, kind: TowerKind): boolean;
	upgradeTowerAt(slotIndex: number): boolean;
	closeMenu(): void;
	startWave(): boolean;
	pause(): void;
	resume(): void;
	isPaused(): boolean;
	setSpeed(multiplier: number): void;
	getSpeed(): number;
	save(): boolean;
	load(): boolean;
	clearSave(): void;
	restart(): void;
	upgradeAffordable(): number;
	getState(): TestApiState;
}

interface TestHandle {
	world: World;
	controller: WaveController;
	loop: Loop;
	restart: () => void;
	startWave: () => void;
	upgradeAffordable: () => number;
	testApi: TestApi;
}

function toggleModal(modal: HTMLElement, open: boolean): void {
	if (open) modal.classList.add("open");
	else modal.classList.remove("open");
}

void boot(canvas, menu);
