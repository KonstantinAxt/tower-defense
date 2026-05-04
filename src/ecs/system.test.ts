import { describe, expect, test } from "bun:test";
import { type System, SystemRunner } from "./system";
import { World } from "./world";

describe("SystemRunner", () => {
	test("runs systems in insertion order with the given dt", () => {
		const w = new World();
		const calls: Array<{ name: string; dt: number }> = [];
		const a: System = (_world, dt) => calls.push({ name: "a", dt });
		const b: System = (_world, dt) => calls.push({ name: "b", dt });

		const runner = new SystemRunner();
		runner.add(a);
		runner.add(b);
		runner.run(w, 0.016);

		expect(runner.count()).toBe(2);
		expect(calls).toEqual([
			{ name: "a", dt: 0.016 },
			{ name: "b", dt: 0.016 },
		]);
	});

	test("clear drops all systems", () => {
		const runner = new SystemRunner();
		runner.add(() => {});
		runner.clear();
		expect(runner.count()).toBe(0);
	});
});
