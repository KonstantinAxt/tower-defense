import type { World } from "./ecs";
import { BUILD_SLOTS } from "./level";
import {
	C_TOWER,
	TOWER_DATA,
	TOWER_KINDS,
	type Tower,
	type TowerKind,
	buildTower,
	findTowerAtSlot,
	pickSlotAt,
	towerBuildCost,
	towerCurrentTier,
	towerInvested,
	towerUpgradeCost,
	upgradeTower,
} from "./towers";

interface HudElements {
	readonly gold: HTMLElement;
	readonly lives: HTMLElement;
	readonly wave: HTMLElement;
}

interface MenuOptions {
	readonly canvas: HTMLCanvasElement;
	readonly menu: HTMLElement;
	readonly hud: HudElements;
	readonly world: World;
}

let selectedSlot: number | null = null;

export function getSelectedSlot(): number | null {
	return selectedSlot;
}

export function setSelectedSlot(value: number | null): void {
	selectedSlot = value;
}

export function attachUI(opts: MenuOptions): void {
	const { canvas, menu, world } = opts;

	canvas.addEventListener("click", (e) => {
		const point = canvasPoint(canvas, e);
		const slot = pickSlotAt(point);
		if (slot === null) {
			selectedSlot = null;
			renderMenu(opts);
			return;
		}
		selectedSlot = slot;
		renderMenu(opts);
	});

	menu.addEventListener("click", (e) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const action = target.dataset.action;
		if (action === "close") {
			selectedSlot = null;
			renderMenu(opts);
			return;
		}
		if (action === "build" && selectedSlot !== null) {
			const kind = target.dataset.kind as TowerKind | undefined;
			if (!kind) return;
			buildTower(world, kind, selectedSlot);
			renderMenu(opts);
			return;
		}
		if (action === "upgrade" && selectedSlot !== null) {
			const tower = findTowerAtSlot(world, selectedSlot);
			if (tower !== null) {
				upgradeTower(world, tower);
				renderMenu(opts);
			}
		}
	});

	renderMenu(opts);
}

export function updateHud(hud: HudElements, world: World): void {
	hud.gold.textContent = String(Math.max(0, Math.floor(world.gold)));
	hud.lives.textContent = String(Math.max(0, world.lives));
	hud.wave.textContent = String(world.wave);
}

function renderMenu(opts: MenuOptions): void {
	const { menu, world } = opts;
	if (selectedSlot === null) {
		menu.innerHTML = "";
		menu.classList.remove("open");
		return;
	}
	const slot = BUILD_SLOTS[selectedSlot];
	if (!slot) return;

	const towerEntity = findTowerAtSlot(world, selectedSlot);
	const tower = towerEntity !== null ? world.getComponent<Tower>(towerEntity, C_TOWER) : null;

	menu.classList.add("open");
	menu.style.left = `${slot.x + 30}px`;
	menu.style.top = `${slot.y - 20}px`;

	if (tower) {
		menu.innerHTML = renderTowerPanel(tower, world.gold);
	} else {
		menu.innerHTML = renderBuildPanel(world.gold);
	}
}

function renderBuildPanel(gold: number): string {
	const items = TOWER_KINDS.map((kind) => {
		const data = TOWER_DATA[kind];
		const tier = data.tiers[0];
		const cost = towerBuildCost(kind);
		const affordable = gold >= cost;
		const cls = affordable ? "tower-btn" : "tower-btn disabled";
		const dis = affordable ? "" : "disabled";
		return `<button class="${cls}" ${dis} data-action="build" data-kind="${kind}">
			<div class="tower-name">${data.label}</div>
			<div class="tower-stats">dmg ${tier.damage} · rng ${tier.range} · rate ${tier.fireRate.toFixed(1)}/s${tier.aoe > 0 ? ` · aoe ${tier.aoe}` : ""}</div>
			<div class="tower-cost">${cost} gold</div>
		</button>`;
	}).join("");
	return `
		<div class="menu-header">Build tower</div>
		${items}
		<button class="menu-close" data-action="close">close</button>
	`;
}

function renderTowerPanel(tower: Tower, gold: number): string {
	const data = TOWER_DATA[tower.kind];
	const tier = towerCurrentTier(tower);
	const upgradeCost = towerUpgradeCost(tower);
	const aoeStr = tier.aoe > 0 ? ` · aoe ${tier.aoe}` : "";
	const upgradeBtn =
		upgradeCost === null
			? `<div class="tower-cost maxed">max tier</div>`
			: gold >= upgradeCost
				? `<button class="tower-btn" data-action="upgrade">upgrade · ${upgradeCost} gold</button>`
				: `<button class="tower-btn disabled" disabled>upgrade · ${upgradeCost} gold</button>`;
	return `
		<div class="menu-header">${data.label} · tier ${tower.tier + 1}/3</div>
		<div class="tower-stats">dmg ${tier.damage} · rng ${tier.range} · rate ${tier.fireRate.toFixed(1)}/s${aoeStr}</div>
		<div class="tower-stats invested">invested ${towerInvested(tower)} gold</div>
		${upgradeBtn}
		<button class="menu-close" data-action="close">close</button>
	`;
}

function canvasPoint(canvas: HTMLCanvasElement, e: MouseEvent): { x: number; y: number } {
	const rect = canvas.getBoundingClientRect();
	const sx = canvas.width / rect.width;
	const sy = canvas.height / rect.height;
	return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}
