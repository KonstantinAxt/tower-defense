import type { SpriteKey, SpriteMap } from "./assets/loader";
import { play } from "./audio";
import type { Entity, World } from "./ecs";
import { C_ENEMY_TYPE, C_HEALTH, C_PATH_FOLLOW, C_POSITION } from "./enemies";
import type { EnemyType, Health, PathFollow, Position } from "./enemies";
import { BUILD_SLOTS, BUILD_SLOT_RADIUS } from "./level";
import type { Point } from "./level";
import { emitDeathBurst, emitExplosion, emitImpact, emitMuzzleFlash } from "./particles";

export type TowerKind = "cannon" | "mg" | "mortar";
export type TargetingMode = "first" | "closest";

export interface TowerTier {
	readonly cost: number; // gold to enter this tier (build cost for tier 0)
	readonly damage: number;
	readonly range: number; // pixels
	readonly fireRate: number; // shots per second
	readonly aoe: number; // splash radius in pixels (0 = single target)
	readonly projectileSpeed: number; // pixels per second
}

export interface TowerData {
	readonly kind: TowerKind;
	readonly label: string;
	readonly sprite: SpriteKey;
	readonly targeting: TargetingMode;
	readonly tiers: readonly [TowerTier, TowerTier, TowerTier];
}

export const TOWER_DATA: Readonly<Record<TowerKind, TowerData>> = {
	cannon: {
		kind: "cannon",
		label: "Cannon",
		sprite: "tower_cannon",
		targeting: "first",
		tiers: [
			{ cost: 50, damage: 22, range: 150, fireRate: 1.0, aoe: 0, projectileSpeed: 380 },
			{ cost: 60, damage: 38, range: 165, fireRate: 1.15, aoe: 0, projectileSpeed: 420 },
			{ cost: 90, damage: 70, range: 180, fireRate: 1.35, aoe: 0, projectileSpeed: 460 },
		],
	},
	mg: {
		kind: "mg",
		label: "Machine Gun",
		sprite: "tower_mg",
		targeting: "closest",
		tiers: [
			{ cost: 75, damage: 7, range: 120, fireRate: 5.0, aoe: 0, projectileSpeed: 520 },
			{ cost: 90, damage: 11, range: 130, fireRate: 6.5, aoe: 0, projectileSpeed: 560 },
			{ cost: 130, damage: 17, range: 140, fireRate: 8.0, aoe: 0, projectileSpeed: 600 },
		],
	},
	mortar: {
		kind: "mortar",
		label: "Mortar",
		sprite: "tower_mortar",
		targeting: "first",
		tiers: [
			{ cost: 110, damage: 30, range: 220, fireRate: 0.45, aoe: 55, projectileSpeed: 260 },
			{ cost: 140, damage: 55, range: 240, fireRate: 0.55, aoe: 65, projectileSpeed: 290 },
			{ cost: 200, damage: 100, range: 260, fireRate: 0.7, aoe: 80, projectileSpeed: 320 },
		],
	},
};

export const TOWER_KINDS: readonly TowerKind[] = ["cannon", "mg", "mortar"];

export const C_TOWER = "Tower";
export const C_PROJECTILE = "Projectile";

export interface Tower {
	kind: TowerKind;
	tier: number; // 0..2
	slotIndex: number; // index into BUILD_SLOTS
	x: number;
	y: number;
	cooldown: number; // seconds remaining until next shot
}

export interface Projectile {
	x: number;
	y: number;
	targetX: number;
	targetY: number;
	target: Entity; // tracked enemy; if dead, projectile flies to last known point
	speed: number;
	damage: number;
	aoe: number; // 0 means direct hit only
}

export function towerBuildCost(kind: TowerKind): number {
	const tier0 = TOWER_DATA[kind].tiers[0];
	return tier0.cost;
}

export function towerUpgradeCost(tower: Tower): number | null {
	const data = TOWER_DATA[tower.kind];
	const next = data.tiers[tower.tier + 1];
	return next ? next.cost : null;
}

export function towerCurrentTier(tower: Tower): TowerTier {
	const data = TOWER_DATA[tower.kind];
	const tier = data.tiers[tower.tier];
	if (!tier) throw new Error(`tower ${tower.kind} has no tier ${tower.tier}`);
	return tier;
}

// Total gold spent on this tower (for sell value display, even if we don't sell).
export function towerInvested(tower: Tower): number {
	const data = TOWER_DATA[tower.kind];
	let total = 0;
	for (let i = 0; i <= tower.tier; i++) {
		const t = data.tiers[i];
		if (t) total += t.cost;
	}
	return total;
}

export function findTowerAtSlot(world: World, slotIndex: number): Entity | null {
	const entities = world.query(C_TOWER);
	for (const e of entities) {
		const tower = world.getComponent<Tower>(e, C_TOWER);
		if (tower && tower.slotIndex === slotIndex) return e;
	}
	return null;
}

export function buildTower(world: World, kind: TowerKind, slotIndex: number): Entity | null {
	const slot = BUILD_SLOTS[slotIndex];
	if (!slot) return null;
	if (findTowerAtSlot(world, slotIndex) !== null) return null;
	const cost = towerBuildCost(kind);
	if (world.gold < cost) return null;

	world.gold -= cost;
	const entity = world.createEntity();
	const tower: Tower = {
		kind,
		tier: 0,
		slotIndex,
		x: slot.x,
		y: slot.y,
		cooldown: 0,
	};
	world.addComponent(entity, C_TOWER, tower);
	return entity;
}

export function upgradeTower(world: World, entity: Entity): boolean {
	const tower = world.getComponent<Tower>(entity, C_TOWER);
	if (!tower) return false;
	const cost = towerUpgradeCost(tower);
	if (cost === null) return false;
	if (world.gold < cost) return false;
	world.gold -= cost;
	tower.tier += 1;
	return true;
}

// Targeting + firing system. Picks an enemy in range based on the tower's
// targeting mode and spawns a Projectile when the cooldown elapses.
export function towerSystem(world: World, dt: number): void {
	const towers = world.query(C_TOWER);
	if (towers.length === 0) return;

	const enemies = collectEnemies(world);
	for (const entity of towers) {
		const tower = world.getComponent<Tower>(entity, C_TOWER);
		if (!tower) continue;
		const tier = towerCurrentTier(tower);
		if (tower.cooldown > 0) tower.cooldown = Math.max(0, tower.cooldown - dt);
		if (tower.cooldown > 0) continue;

		const target = pickTarget(tower, tier, enemies);
		if (!target) continue;

		spawnProjectile(world, tower, tier, target);
		tower.cooldown = 1 / tier.fireRate;
	}
}

interface EnemySnapshot {
	readonly entity: Entity;
	readonly x: number;
	readonly y: number;
	readonly distance: number; // arc length along the path
}

function collectEnemies(world: World): EnemySnapshot[] {
	const ids = world.query(C_POSITION, C_PATH_FOLLOW, C_ENEMY_TYPE, C_HEALTH);
	const out: EnemySnapshot[] = [];
	for (const id of ids) {
		const pos = world.getComponent<Position>(id, C_POSITION);
		const pf = world.getComponent<PathFollow>(id, C_PATH_FOLLOW);
		const health = world.getComponent<Health>(id, C_HEALTH);
		if (!pos || !pf || !health) continue;
		if (health.hp <= 0) continue;
		out.push({ entity: id, x: pos.x, y: pos.y, distance: pf.distance });
	}
	return out;
}

function pickTarget(
	tower: Tower,
	tier: TowerTier,
	enemies: readonly EnemySnapshot[],
): EnemySnapshot | null {
	const r2 = tier.range * tier.range;
	let best: EnemySnapshot | null = null;
	let bestKey = Number.NEGATIVE_INFINITY;
	for (const enemy of enemies) {
		const dx = enemy.x - tower.x;
		const dy = enemy.y - tower.y;
		if (dx * dx + dy * dy > r2) continue;
		const key =
			TOWER_DATA[tower.kind].targeting === "first" ? enemy.distance : -(dx * dx + dy * dy);
		if (key > bestKey) {
			bestKey = key;
			best = enemy;
		}
	}
	return best;
}

function spawnProjectile(world: World, tower: Tower, tier: TowerTier, target: EnemySnapshot): void {
	const entity = world.createEntity();
	const proj: Projectile = {
		x: tower.x,
		y: tower.y,
		targetX: target.x,
		targetY: target.y,
		target: target.entity,
		speed: tier.projectileSpeed,
		damage: tier.damage,
		aoe: tier.aoe,
	};
	world.addComponent(entity, C_PROJECTILE, proj);
	emitMuzzleFlash(tower.x, tower.y, target.x - tower.x, target.y - tower.y);
	play("shot");
}

const HIT_RADIUS = 6;

export function projectileSystem(world: World, dt: number): void {
	const projectiles = world.query(C_PROJECTILE);
	if (projectiles.length === 0) return;

	for (const entity of projectiles) {
		const proj = world.getComponent<Projectile>(entity, C_PROJECTILE);
		if (!proj) continue;

		const targetPos = world.getComponent<Position>(proj.target, C_POSITION);
		if (targetPos) {
			proj.targetX = targetPos.x;
			proj.targetY = targetPos.y;
		}

		const dx = proj.targetX - proj.x;
		const dy = proj.targetY - proj.y;
		const dist = Math.hypot(dx, dy);
		const step = proj.speed * dt;

		if (dist <= step + HIT_RADIUS) {
			proj.x = proj.targetX;
			proj.y = proj.targetY;
			resolveHit(world, proj);
			world.destroyEntity(entity);
			continue;
		}

		proj.x += (dx / dist) * step;
		proj.y += (dy / dist) * step;
	}
}

function resolveHit(world: World, proj: Projectile): void {
	if (proj.aoe > 0) {
		emitExplosion(proj.x, proj.y, proj.aoe);
		play("hit");
		const ids = world.query(C_POSITION, C_HEALTH, C_ENEMY_TYPE);
		const r2 = proj.aoe * proj.aoe;
		for (const id of ids) {
			const pos = world.getComponent<Position>(id, C_POSITION);
			const health = world.getComponent<Health>(id, C_HEALTH);
			if (!pos || !health || health.hp <= 0) continue;
			const ddx = pos.x - proj.x;
			const ddy = pos.y - proj.y;
			if (ddx * ddx + ddy * ddy <= r2) {
				applyDamage(world, id, proj.damage);
			}
		}
		return;
	}

	emitImpact(proj.x, proj.y);
	play("hit");
	if (world.hasEntity(proj.target)) {
		applyDamage(world, proj.target, proj.damage);
	}
}

function applyDamage(world: World, target: Entity, damage: number): void {
	const health = world.getComponent<Health>(target, C_HEALTH);
	if (!health || health.hp <= 0) return;
	health.hp -= damage;
	if (health.hp <= 0) {
		const et = world.getComponent<EnemyType>(target, C_ENEMY_TYPE);
		if (et) {
			world.gold += et.bounty;
			const pos = world.getComponent<Position>(target, C_POSITION);
			const color = et.kind === "fast" ? "#e24646" : "#a07050";
			if (pos) emitDeathBurst(pos.x, pos.y, color);
			play("enemyDeath");
		}
		world.destroyEntity(target);
	}
}

export function renderTowers(
	ctx: CanvasRenderingContext2D,
	world: World,
	sprites: SpriteMap,
	selectedSlot: number | null,
): void {
	const towers = world.query(C_TOWER);
	const size = BUILD_SLOT_RADIUS * 2;
	for (const entity of towers) {
		const tower = world.getComponent<Tower>(entity, C_TOWER);
		if (!tower) continue;
		const data = TOWER_DATA[tower.kind];
		const sprite = sprites.get(data.sprite) ?? null;
		if (sprite) {
			ctx.drawImage(sprite, tower.x - size / 2, tower.y - size / 2, size, size);
		} else {
			ctx.save();
			ctx.fillStyle =
				tower.kind === "cannon" ? "#5a6a8c" : tower.kind === "mg" ? "#3a8a3a" : "#8a4a3a";
			ctx.beginPath();
			ctx.arc(tower.x, tower.y, BUILD_SLOT_RADIUS - 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		drawTierPips(ctx, tower);
	}

	if (selectedSlot !== null) {
		drawSelection(ctx, world, selectedSlot);
	}
}

function drawTierPips(ctx: CanvasRenderingContext2D, tower: Tower): void {
	const pipR = 2.5;
	const gap = 8;
	const baseX = tower.x - gap;
	const y = tower.y + BUILD_SLOT_RADIUS - 4;
	ctx.save();
	for (let i = 0; i < 3; i++) {
		ctx.fillStyle = i <= tower.tier ? "#ffd24a" : "rgba(0,0,0,0.35)";
		ctx.beginPath();
		ctx.arc(baseX + i * gap, y, pipR, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, world: World, slotIndex: number): void {
	const slot = BUILD_SLOTS[slotIndex];
	if (!slot) return;
	const tower = findTowerEntityAtSlot(world, slotIndex);
	const range = tower ? towerCurrentTier(tower).range : 0;

	ctx.save();
	ctx.strokeStyle = "rgba(255, 240, 120, 0.95)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(slot.x, slot.y, BUILD_SLOT_RADIUS + 4, 0, Math.PI * 2);
	ctx.stroke();

	if (range > 0) {
		ctx.strokeStyle = "rgba(255, 240, 120, 0.55)";
		ctx.fillStyle = "rgba(255, 240, 120, 0.08)";
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.arc(slot.x, slot.y, range, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
	}
	ctx.restore();
}

function findTowerEntityAtSlot(world: World, slotIndex: number): Tower | null {
	const id = findTowerAtSlot(world, slotIndex);
	if (id === null) return null;
	return world.getComponent<Tower>(id, C_TOWER) ?? null;
}

export function renderProjectiles(
	ctx: CanvasRenderingContext2D,
	world: World,
	sprites: SpriteMap,
): void {
	const projectiles = world.query(C_PROJECTILE);
	const sprite = sprites.get("projectile") ?? null;
	const size = 14;
	for (const entity of projectiles) {
		const proj = world.getComponent<Projectile>(entity, C_PROJECTILE);
		if (!proj) continue;
		if (sprite) {
			ctx.drawImage(sprite, proj.x - size / 2, proj.y - size / 2, size, size);
		} else {
			ctx.save();
			ctx.fillStyle = "#222";
			ctx.beginPath();
			ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}
}

export function pickSlotAt(point: Point): number | null {
	const r2 = (BUILD_SLOT_RADIUS + 4) * (BUILD_SLOT_RADIUS + 4);
	for (let i = 0; i < BUILD_SLOTS.length; i++) {
		const slot = BUILD_SLOTS[i];
		if (!slot) continue;
		const dx = slot.x - point.x;
		const dy = slot.y - point.y;
		if (dx * dx + dy * dy <= r2) return i;
	}
	return null;
}
