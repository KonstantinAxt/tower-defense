export interface LoopOptions {
	fixedDt: number;
	maxFrameTime?: number;
}

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class Loop {
	private readonly fixedDt: number;
	private readonly maxFrameTime: number;
	private accumulator = 0;
	private lastMs: number | null = null;
	private paused = false;

	constructor(
		private readonly update: UpdateFn,
		private readonly render: RenderFn,
		opts: LoopOptions,
	) {
		if (opts.fixedDt <= 0) throw new Error("fixedDt must be > 0");
		this.fixedDt = opts.fixedDt;
		this.maxFrameTime = opts.maxFrameTime ?? 0.25;
	}

	step(nowMs: number): void {
		if (this.lastMs === null) {
			this.lastMs = nowMs;
			this.render(0);
			return;
		}
		let frameTime = (nowMs - this.lastMs) / 1000;
		this.lastMs = nowMs;
		if (frameTime < 0) frameTime = 0;
		if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;

		if (!this.paused) {
			this.accumulator += frameTime;
			while (this.accumulator >= this.fixedDt) {
				this.update(this.fixedDt);
				this.accumulator -= this.fixedDt;
			}
		}

		const alpha = this.accumulator / this.fixedDt;
		this.render(alpha);
	}

	pause(): void {
		this.paused = true;
	}

	resume(): void {
		this.paused = false;
	}

	isPaused(): boolean {
		return this.paused;
	}

	reset(): void {
		this.accumulator = 0;
		this.lastMs = null;
	}
}
