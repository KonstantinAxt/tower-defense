import { afterEach, describe, expect, test } from "bun:test";
import { _resetForTests, isMuted, play, setMuted } from "./audio";

afterEach(() => {
	_resetForTests();
});

describe("audio", () => {
	test("play is a no-op when no AudioContext is available", () => {
		// Bun's test env has no `window` / AudioContext; play should not throw.
		expect(() => play("shot")).not.toThrow();
		expect(() => play("hit")).not.toThrow();
		expect(() => play("build")).not.toThrow();
		expect(() => play("upgrade")).not.toThrow();
		expect(() => play("enemyDeath")).not.toThrow();
		expect(() => play("waveStart")).not.toThrow();
		expect(() => play("win")).not.toThrow();
		expect(() => play("lose")).not.toThrow();
	});

	test("setMuted toggles internal flag", () => {
		expect(isMuted()).toBe(false);
		setMuted(true);
		expect(isMuted()).toBe(true);
		setMuted(false);
		expect(isMuted()).toBe(false);
	});
});
