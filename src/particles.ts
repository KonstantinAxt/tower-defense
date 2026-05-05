// Pooled particle system. Particles are kept in a single fixed-capacity array
// of structs; an `alive` flag and a free-list let us spawn without allocating.

export interface ParticleSpec {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number; // total lifetime in seconds
	size: number; // px radius
	color: string; // CSS color
	gravity?: number; // px/s^2 applied to vy
	drag?: number; // multiplied each second; e.g. 2 → e^-(2*dt)
	shrink?: boolean; // when true, size scales with remaining life
	fade?: boolean; // when true, alpha scales with remaining life
}

interface Particle {
	alive: boolean;
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	size: number;
	color: string;
	gravity: number;
	drag: number;
	shrink: boolean;
	fade: boolean;
}

const MAX_PARTICLES = 600;

export class ParticleSystem {
	private readonly pool: Particle[] = [];
	private readonly free: number[] = [];

	constructor(capacity: number = MAX_PARTICLES) {
		for (let i = 0; i < capacity; i++) {
			this.pool.push(makeDeadParticle());
			this.free.push(i);
		}
	}

	spawn(spec: ParticleSpec): boolean {
		const idx = this.free.pop();
		if (idx === undefined) return false;
		const p = this.pool[idx];
		if (!p) return false;
		p.alive = true;
		p.x = spec.x;
		p.y = spec.y;
		p.vx = spec.vx;
		p.vy = spec.vy;
		p.age = 0;
		p.life = spec.life;
		p.size = spec.size;
		p.color = spec.color;
		p.gravity = spec.gravity ?? 0;
		p.drag = spec.drag ?? 0;
		p.shrink = spec.shrink ?? false;
		p.fade = spec.fade ?? true;
		return true;
	}

	update(dt: number): void {
		for (let i = 0; i < this.pool.length; i++) {
			const p = this.pool[i];
			if (!p || !p.alive) continue;
			p.age += dt;
			if (p.age >= p.life) {
				p.alive = false;
				this.free.push(i);
				continue;
			}
			if (p.drag > 0) {
				const k = Math.exp(-p.drag * dt);
				p.vx *= k;
				p.vy *= k;
			}
			if (p.gravity !== 0) p.vy += p.gravity * dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
		}
	}

	render(ctx: CanvasRenderingContext2D): void {
		ctx.save();
		for (const p of this.pool) {
			if (!p.alive) continue;
			const t = 1 - p.age / p.life;
			const alpha = p.fade ? Math.max(0, t) : 1;
			const radius = p.shrink ? Math.max(0.5, p.size * t) : p.size;
			ctx.globalAlpha = alpha;
			ctx.fillStyle = p.color;
			ctx.beginPath();
			ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	clear(): void {
		this.free.length = 0;
		for (let i = 0; i < this.pool.length; i++) {
			const p = this.pool[i];
			if (p) p.alive = false;
			this.free.push(i);
		}
	}

	aliveCount(): number {
		return this.pool.length - this.free.length;
	}
}

function makeDeadParticle(): Particle {
	return {
		alive: false,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		age: 0,
		life: 0,
		size: 0,
		color: "#fff",
		gravity: 0,
		drag: 0,
		shrink: false,
		fade: true,
	};
}

// ---- module-level singleton + emitters --------------------------------------

const globalSystem = new ParticleSystem();

export function getParticleSystem(): ParticleSystem {
	return globalSystem;
}

export function updateParticles(dt: number): void {
	globalSystem.update(dt);
}

export function renderParticles(ctx: CanvasRenderingContext2D): void {
	globalSystem.render(ctx);
}

export function clearParticles(): void {
	globalSystem.clear();
}

function rand(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

// Muzzle flash: a few short, fast yellow sparks aimed roughly toward the
// target, plus a bright core.
export function emitMuzzleFlash(x: number, y: number, dirX: number, dirY: number, scale = 1): void {
	const len = Math.hypot(dirX, dirY) || 1;
	const nx = dirX / len;
	const ny = dirY / len;
	for (let i = 0; i < 6; i++) {
		const spread = rand(-0.6, 0.6);
		const cos = Math.cos(spread);
		const sin = Math.sin(spread);
		const dx = nx * cos - ny * sin;
		const dy = nx * sin + ny * cos;
		const speed = rand(80, 200) * scale;
		globalSystem.spawn({
			x,
			y,
			vx: dx * speed,
			vy: dy * speed,
			life: rand(0.08, 0.16),
			size: rand(2, 3.5) * scale,
			color: i % 2 === 0 ? "#ffd24a" : "#fff3a0",
			drag: 6,
			shrink: true,
		});
	}
	globalSystem.spawn({
		x,
		y,
		vx: 0,
		vy: 0,
		life: 0.07,
		size: 5 * scale,
		color: "#ffffff",
		shrink: true,
	});
}

// Impact spark: small light burst when a projectile hits.
export function emitImpact(x: number, y: number): void {
	for (let i = 0; i < 8; i++) {
		const angle = rand(0, Math.PI * 2);
		const speed = rand(60, 160);
		globalSystem.spawn({
			x,
			y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			life: rand(0.18, 0.32),
			size: rand(1.5, 2.6),
			color: i % 2 === 0 ? "#ffe28a" : "#ffffff",
			drag: 3,
			shrink: true,
		});
	}
}

// Mortar explosion: chunky orange/red ring with smoke.
export function emitExplosion(x: number, y: number, radius: number): void {
	const sparks = Math.min(40, Math.max(16, Math.floor(radius * 0.6)));
	for (let i = 0; i < sparks; i++) {
		const angle = rand(0, Math.PI * 2);
		const speed = rand(60, 220) * (radius / 60);
		globalSystem.spawn({
			x,
			y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			life: rand(0.25, 0.55),
			size: rand(2.5, 4.5),
			color: i % 3 === 0 ? "#ffd24a" : i % 3 === 1 ? "#e25a2a" : "#9a1f1f",
			drag: 2.5,
			gravity: 60,
			shrink: true,
		});
	}
	for (let i = 0; i < 10; i++) {
		const angle = rand(0, Math.PI * 2);
		const speed = rand(20, 60);
		globalSystem.spawn({
			x: x + rand(-radius * 0.2, radius * 0.2),
			y: y + rand(-radius * 0.2, radius * 0.2),
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 30,
			life: rand(0.5, 0.9),
			size: rand(4, 7),
			color: "rgba(80,80,80,0.85)",
			drag: 1.5,
			shrink: false,
			fade: true,
		});
	}
	// Bright flash
	globalSystem.spawn({
		x,
		y,
		vx: 0,
		vy: 0,
		life: 0.12,
		size: radius * 0.9,
		color: "rgba(255, 230, 140, 0.7)",
		shrink: true,
	});
}

// Enemy death burst: multi-color radial scatter.
export function emitDeathBurst(x: number, y: number, color = "#e24646"): void {
	for (let i = 0; i < 14; i++) {
		const angle = rand(0, Math.PI * 2);
		const speed = rand(60, 180);
		globalSystem.spawn({
			x,
			y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			life: rand(0.3, 0.6),
			size: rand(2, 3.5),
			color: i % 3 === 0 ? "#ffffff" : color,
			drag: 2,
			gravity: 80,
			shrink: true,
		});
	}
}
