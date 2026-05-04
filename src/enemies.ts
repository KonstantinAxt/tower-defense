import type { SpriteKey, SpriteMap } from "./assets/loader";
import type { Entity, World } from "./ecs";
import { PATH_TOTAL_LENGTH, positionAtDistance } from "./level";

export type EnemyKind = "fast" | "heavy";

export interface EnemyStats {
	readonly kind: EnemyKind;
	readonly speed: number; // pixels per second
	readonly maxHp: number;
	readonly bounty: number; // gold awarded on kill
	readonly leakDamage: number; // lives lost when reaching the exit
	readonly sprite: SpriteKey;
	readonly spriteSize: number; // drawn square size, in pixels
}

export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
	fast: {
		kind: "fast",
		speed: 110,
		maxHp: 30,
		bounty: 8,
		leakDamage: 1,
		sprite: "enemy_fast",
		spriteSize: 38,
	},
	heavy: {
		kind: "heavy",
		speed: 55,
		maxHp: 140,
		bounty: 20,
		leakDamage: 3,
		sprite: "enemy_heavy",
		spriteSize: 46,
	},
};

// Component type identifiers. Kept as literal strings so they are usable from
// World.query directly and stay stable across modules.
export const C_POSITION = "Position";
export const C_VELOCITY = "Velocity";
export const C_PATH_FOLLOW = "PathFollow";
export const C_HEALTH = "Health";
export const C_ENEMY_TYPE = "EnemyType";

export interface Position {
	x: number;
	y: number;
}

export interface Velocity {
	dx: number;
	dy: number;
}

export interface PathFollow {
	distance: number; // arc length traveled from PATH[0]
	speed: number; // pixels per second
}

export interface Health {
	hp: number;
	max: number;
}

export interface EnemyType {
	kind: EnemyKind;
	bounty: number;
	leakDamage: number;
	sprite: SpriteKey;
	spriteSize: number;
}

export function spawnEnemy(world: World, kind: EnemyKind): Entity {
	const stats = ENEMY_STATS[kind];
	const pose = positionAtDistance(0);
	const entity = world.createEntity();
	const pos: Position = { x: pose.x, y: pose.y };
	const vel: Velocity = { dx: pose.dirX * stats.speed, dy: pose.dirY * stats.speed };
	const pf: PathFollow = { distance: 0, speed: stats.speed };
	const health: Health = { hp: stats.maxHp, max: stats.maxHp };
	const et: EnemyType = {
		kind: stats.kind,
		bounty: stats.bounty,
		leakDamage: stats.leakDamage,
		sprite: stats.sprite,
		spriteSize: stats.spriteSize,
	};
	world.addComponent(entity, C_POSITION, pos);
	world.addComponent(entity, C_VELOCITY, vel);
	world.addComponent(entity, C_PATH_FOLLOW, pf);
	world.addComponent(entity, C_HEALTH, health);
	world.addComponent(entity, C_ENEMY_TYPE, et);
	return entity;
}

// Movement system: advances PathFollow.distance, updates Position and
// Velocity, and leaks enemies (destroy + deduct lives) on reaching the exit.
export function movementSystem(world: World, dt: number): void {
	const entities = world.query(C_PATH_FOLLOW, C_POSITION, C_VELOCITY, C_ENEMY_TYPE);
	for (const entity of entities) {
		const pf = world.getComponent<PathFollow>(entity, C_PATH_FOLLOW);
		const pos = world.getComponent<Position>(entity, C_POSITION);
		const vel = world.getComponent<Velocity>(entity, C_VELOCITY);
		const et = world.getComponent<EnemyType>(entity, C_ENEMY_TYPE);
		if (!pf || !pos || !vel || !et) continue;

		pf.distance += pf.speed * dt;

		if (pf.distance >= PATH_TOTAL_LENGTH) {
			world.lives -= et.leakDamage;
			world.destroyEntity(entity);
			continue;
		}

		const pose = positionAtDistance(pf.distance);
		pos.x = pose.x;
		pos.y = pose.y;
		vel.dx = pose.dirX * pf.speed;
		vel.dy = pose.dirY * pf.speed;
	}
}

const HP_BAR_WIDTH = 34;
const HP_BAR_HEIGHT = 4;
const HP_BAR_GAP = 6;

export function renderEnemies(
	ctx: CanvasRenderingContext2D,
	world: World,
	sprites: SpriteMap,
): void {
	const entities = world.query(C_POSITION, C_ENEMY_TYPE, C_HEALTH);
	for (const entity of entities) {
		const pos = world.getComponent<Position>(entity, C_POSITION);
		const et = world.getComponent<EnemyType>(entity, C_ENEMY_TYPE);
		const health = world.getComponent<Health>(entity, C_HEALTH);
		if (!pos || !et || !health) continue;

		const size = et.spriteSize;
		const sprite = sprites.get(et.sprite) ?? null;
		if (sprite) {
			ctx.drawImage(sprite, pos.x - size / 2, pos.y - size / 2, size, size);
		} else {
			ctx.save();
			ctx.fillStyle = et.kind === "fast" ? "#e24646" : "#6a4a2a";
			ctx.beginPath();
			ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		drawHpBar(ctx, pos.x, pos.y - size / 2 - HP_BAR_GAP, health);
	}
}

function drawHpBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, health: Health): void {
	const ratio = health.max > 0 ? Math.max(0, Math.min(1, health.hp / health.max)) : 0;
	const x = cx - HP_BAR_WIDTH / 2;
	const y = cy - HP_BAR_HEIGHT;
	ctx.save();
	ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
	ctx.fillRect(x - 1, y - 1, HP_BAR_WIDTH + 2, HP_BAR_HEIGHT + 2);
	ctx.fillStyle = "#3a0f0f";
	ctx.fillRect(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT);
	ctx.fillStyle = ratio > 0.5 ? "#4ecb4e" : ratio > 0.25 ? "#e2c044" : "#e25050";
	ctx.fillRect(x, y, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT);
	ctx.restore();
}
