// Hand-rolled Web Audio synth. One AudioContext, lazy-created on first user
// gesture; each event is a short patch built from oscillators, filtered noise,
// and exponential gain envelopes. Cheap enough to fire many per frame.

export type SfxEvent =
	| "shot"
	| "hit"
	| "build"
	| "upgrade"
	| "enemyDeath"
	| "waveStart"
	| "win"
	| "lose";

interface AudioState {
	ctx: AudioContext | null;
	master: GainNode | null;
	muted: boolean;
	noiseBuffer: AudioBuffer | null;
}

const state: AudioState = {
	ctx: null,
	master: null,
	muted: false,
	noiseBuffer: null,
};

function ensureCtx(): AudioContext | null {
	if (typeof window === "undefined") return null;
	const Ctor =
		window.AudioContext ??
		(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	if (!state.ctx) {
		state.ctx = new Ctor();
		const master = state.ctx.createGain();
		master.gain.value = 0.5;
		master.connect(state.ctx.destination);
		state.master = master;
		state.noiseBuffer = makeNoiseBuffer(state.ctx, 0.5);
	}
	return state.ctx;
}

function makeNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
	const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
	const buf = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buf.getChannelData(0);
	for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
	return buf;
}

// Wire to first user gesture (click / keydown / touch). Safe to call multiple
// times; subsequent calls are no-ops.
export function attachAutoResume(target: EventTarget = window): void {
	if (typeof window === "undefined") return;
	const events = ["pointerdown", "keydown", "touchstart"] as const;
	const handler = (): void => {
		const ctx = ensureCtx();
		if (ctx && ctx.state === "suspended") void ctx.resume();
		for (const ev of events) target.removeEventListener(ev, handler);
	};
	for (const ev of events) target.addEventListener(ev, handler, { once: false });
}

export function setMuted(muted: boolean): void {
	state.muted = muted;
	if (state.master && state.ctx) {
		const target = muted ? 0 : 0.5;
		state.master.gain.setTargetAtTime(target, state.ctx.currentTime, 0.01);
	}
}

export function isMuted(): boolean {
	return state.muted;
}

export function play(event: SfxEvent): void {
	if (state.muted) return;
	const ctx = ensureCtx();
	if (!ctx || !state.master) return;
	if (ctx.state === "suspended") return; // wait for user gesture

	switch (event) {
		case "shot":
			playShot(ctx, state.master);
			return;
		case "hit":
			playHit(ctx, state.master);
			return;
		case "build":
			playBuild(ctx, state.master);
			return;
		case "upgrade":
			playUpgrade(ctx, state.master);
			return;
		case "enemyDeath":
			playEnemyDeath(ctx, state.master);
			return;
		case "waveStart":
			playWaveStart(ctx, state.master);
			return;
		case "win":
			playWin(ctx, state.master);
			return;
		case "lose":
			playLose(ctx, state.master);
			return;
	}
}

// ---- patches ----------------------------------------------------------------

function envelope(
	ctx: AudioContext,
	gain: GainNode,
	peak: number,
	attack: number,
	decay: number,
): void {
	const t0 = ctx.currentTime;
	gain.gain.setValueAtTime(0.0001, t0);
	gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noiseSource(ctx: AudioContext): AudioBufferSourceNode | null {
	if (!state.noiseBuffer) return null;
	const src = ctx.createBufferSource();
	src.buffer = state.noiseBuffer;
	return src;
}

function playShot(ctx: AudioContext, dest: AudioNode): void {
	const noise = noiseSource(ctx);
	if (!noise) return;
	const filter = ctx.createBiquadFilter();
	filter.type = "bandpass";
	filter.frequency.setValueAtTime(1800, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.07);
	filter.Q.value = 1.4;
	const gain = ctx.createGain();
	envelope(ctx, gain, 0.35, 0.005, 0.09);
	noise.connect(filter).connect(gain).connect(dest);
	noise.start();
	noise.stop(ctx.currentTime + 0.12);

	const osc = ctx.createOscillator();
	osc.type = "square";
	osc.frequency.setValueAtTime(220, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05);
	const og = ctx.createGain();
	envelope(ctx, og, 0.18, 0.002, 0.06);
	osc.connect(og).connect(dest);
	osc.start();
	osc.stop(ctx.currentTime + 0.08);
}

function playHit(ctx: AudioContext, dest: AudioNode): void {
	const noise = noiseSource(ctx);
	if (!noise) return;
	const filter = ctx.createBiquadFilter();
	filter.type = "highpass";
	filter.frequency.value = 900;
	const gain = ctx.createGain();
	envelope(ctx, gain, 0.22, 0.003, 0.06);
	noise.connect(filter).connect(gain).connect(dest);
	noise.start();
	noise.stop(ctx.currentTime + 0.08);
}

function playBuild(ctx: AudioContext, dest: AudioNode): void {
	const tones = [440, 660];
	tones.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		const t0 = ctx.currentTime + i * 0.06;
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
		osc.connect(gain).connect(dest);
		osc.start(t0);
		osc.stop(t0 + 0.2);
	});
}

function playUpgrade(ctx: AudioContext, dest: AudioNode): void {
	const tones = [523.25, 659.25, 783.99]; // C5, E5, G5
	tones.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		const t0 = ctx.currentTime + i * 0.05;
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
		osc.connect(gain).connect(dest);
		osc.start(t0);
		osc.stop(t0 + 0.24);
	});
}

function playEnemyDeath(ctx: AudioContext, dest: AudioNode): void {
	const noise = noiseSource(ctx);
	if (!noise) return;
	const filter = ctx.createBiquadFilter();
	filter.type = "lowpass";
	filter.frequency.setValueAtTime(1400, ctx.currentTime);
	filter.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.18);
	const gain = ctx.createGain();
	envelope(ctx, gain, 0.32, 0.004, 0.22);
	noise.connect(filter).connect(gain).connect(dest);
	noise.start();
	noise.stop(ctx.currentTime + 0.28);

	const osc = ctx.createOscillator();
	osc.type = "sawtooth";
	osc.frequency.setValueAtTime(180, ctx.currentTime);
	osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.18);
	const og = ctx.createGain();
	envelope(ctx, og, 0.18, 0.005, 0.18);
	osc.connect(og).connect(dest);
	osc.start();
	osc.stop(ctx.currentTime + 0.22);
}

function playWaveStart(ctx: AudioContext, dest: AudioNode): void {
	const tones = [392.0, 523.25, 659.25]; // G4, C5, E5
	tones.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = "square";
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		const t0 = ctx.currentTime + i * 0.09;
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
		osc.connect(gain).connect(dest);
		osc.start(t0);
		osc.stop(t0 + 0.3);
	});
}

function playWin(ctx: AudioContext, dest: AudioNode): void {
	const tones = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
	tones.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = "triangle";
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		const t0 = ctx.currentTime + i * 0.13;
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
		osc.connect(gain).connect(dest);
		osc.start(t0);
		osc.stop(t0 + 0.5);
	});
}

function playLose(ctx: AudioContext, dest: AudioNode): void {
	const tones = [392.0, 311.13, 233.08]; // G4, Eb4, Bb3
	tones.forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		const t0 = ctx.currentTime + i * 0.18;
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.26, t0 + 0.03);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
		osc.connect(gain).connect(dest);
		osc.start(t0);
		osc.stop(t0 + 0.6);
	});
}

// Test-only: reset module state. Not used at runtime.
export function _resetForTests(): void {
	state.ctx = null;
	state.master = null;
	state.muted = false;
	state.noiseBuffer = null;
}
