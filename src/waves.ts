import type { World } from "./ecs";
import { C_ENEMY_TYPE, type EnemyKind, spawnEnemy } from "./enemies";

export type WaveState = "idle" | "spawning" | "clearing" | "won" | "lost";

export interface WaveSpawn {
	readonly kind: EnemyKind;
	readonly count: number;
	readonly interval: number; // seconds between consecutive spawns in this group
	readonly delay: number; // seconds to wait after wave start before this group begins
	readonly hpScale: number;
}

export interface WaveDef {
	readonly number: number;
	readonly spawns: readonly WaveSpawn[];
}

export const TOTAL_WAVES = 10;

export const WAVES: readonly WaveDef[] = (() => {
	const out: WaveDef[] = [];
	for (let i = 1; i <= 9; i++) {
		const fastCount = 6 + i; // 7..15
		const heavyCount = i >= 3 ? Math.floor((i - 1) / 2) : 0; // 0,0,1,1,2,2,3,3,4
		const hpScale = 1 + (i - 1) * 0.15;
		const spawns: WaveSpawn[] = [
			{ kind: "fast", count: fastCount, interval: 0.7, delay: 0, hpScale },
		];
		if (heavyCount > 0) {
			spawns.push({
				kind: "heavy",
				count: heavyCount,
				interval: 1.5,
				delay: 2,
				hpScale,
			});
		}
		out.push({ number: i, spawns });
	}
	out.push({
		number: 10,
		spawns: [
			{ kind: "fast", count: 24, interval: 0.4, delay: 0, hpScale: 1.8 },
			{ kind: "heavy", count: 10, interval: 1.0, delay: 1, hpScale: 1.8 },
			{ kind: "fast", count: 14, interval: 0.45, delay: 13, hpScale: 2.0 },
		],
	});
	return out;
})();

export function getWaveDef(waveNumber: number): WaveDef | null {
	return WAVES[waveNumber - 1] ?? null;
}

type SpawnFn = (world: World, kind: EnemyKind, hpScale: number) => unknown;
type WaveClearedFn = (waveJustCleared: number) => void;

export class WaveController {
	state: WaveState = "idle";
	currentWave = 1;
	onCleared: WaveClearedFn | null = null;
	private waveTime = 0;
	private spawnCounters: number[] = [];
	private readonly spawn: SpawnFn;

	constructor(spawn: SpawnFn = spawnEnemy) {
		this.spawn = spawn;
	}

	canStart(): boolean {
		return this.state === "idle" && this.currentWave <= TOTAL_WAVES;
	}

	startWave(world: World): boolean {
		if (!this.canStart()) return false;
		const def = WAVES[this.currentWave - 1];
		if (!def) return false;
		this.spawnCounters = def.spawns.map(() => 0);
		this.waveTime = 0;
		this.state = "spawning";
		world.wave = this.currentWave;
		return true;
	}

	update(world: World, dt: number): void {
		if (this.state === "won" || this.state === "lost") return;

		if (world.lives <= 0) {
			this.state = "lost";
			return;
		}

		if (this.state === "idle") return;

		this.waveTime += dt;
		const def = WAVES[this.currentWave - 1];
		if (!def) return;

		if (this.state === "spawning") {
			let allEmitted = true;
			for (let i = 0; i < def.spawns.length; i++) {
				const s = def.spawns[i];
				if (!s) continue;
				let next = this.spawnCounters[i] ?? 0;
				while (next < s.count && this.waveTime >= s.delay + next * s.interval) {
					this.spawn(world, s.kind, s.hpScale);
					next++;
				}
				this.spawnCounters[i] = next;
				if (next < s.count) allEmitted = false;
			}
			if (allEmitted) this.state = "clearing";
		}

		if (this.state === "clearing") {
			const enemies = world.query(C_ENEMY_TYPE);
			if (enemies.length === 0) this.onWaveCleared(world);
		}
	}

	private onWaveCleared(world: World): void {
		const cleared = this.currentWave;
		if (this.currentWave >= TOTAL_WAVES) {
			this.state = "won";
		} else {
			this.currentWave += 1;
			this.state = "idle";
			this.waveTime = 0;
		}
		world.wave = this.currentWave;
		this.onCleared?.(cleared);
	}

	restart(): void {
		this.state = "idle";
		this.currentWave = 1;
		this.waveTime = 0;
		this.spawnCounters = [];
	}
}
