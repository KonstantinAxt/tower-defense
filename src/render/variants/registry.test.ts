import { describe, expect, test } from "bun:test";
import { type RegistryLogger, createVariantRegistry, readUiParam } from "./registry";
import type { VariantContext, VariantFactory, VariantId, VariantModule } from "./types";

function makeLogger(): { logger: RegistryLogger; warnings: string[] } {
	const warnings: string[] = [];
	return {
		warnings,
		logger: {
			warn(message) {
				warnings.push(message);
			},
		},
	};
}

function stubFactory(id: VariantId): VariantFactory {
	return (): VariantModule => ({
		id,
		update() {},
		dispose() {},
	});
}

describe("readUiParam", () => {
	test("returns null for empty/null search strings", () => {
		expect(readUiParam(null)).toBe(null);
		expect(readUiParam(undefined)).toBe(null);
		expect(readUiParam("")).toBe(null);
	});

	test("extracts the ui param with or without leading '?'", () => {
		expect(readUiParam("?ui=A")).toBe("A");
		expect(readUiParam("ui=B&foo=bar")).toBe("B");
		expect(readUiParam("?foo=bar&ui=neutral")).toBe("neutral");
	});

	test("returns null when ui is missing", () => {
		expect(readUiParam("?foo=bar")).toBe(null);
	});
});

describe("variant registry resolve()", () => {
	test("defaults to A when nothing is requested AND A is registered", () => {
		const { logger, warnings } = makeLogger();
		const r = createVariantRegistry(logger);
		r.register("A", stubFactory("A"));
		r.register("neutral", stubFactory("neutral"));
		expect(r.resolve(null)).toBe("A");
		expect(warnings).toHaveLength(0);
	});

	test("falls back to neutral when default A is not registered", () => {
		const { logger, warnings } = makeLogger();
		const r = createVariantRegistry(logger);
		r.register("neutral", stubFactory("neutral"));
		expect(r.resolve(null)).toBe("neutral");
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("not registered");
	});

	test("honours a known requested id", () => {
		const { logger } = makeLogger();
		const r = createVariantRegistry(logger);
		r.register("neutral", stubFactory("neutral"));
		expect(r.resolve("neutral")).toBe("neutral");
	});

	test("warns and falls back when requested id is unknown", () => {
		const { logger, warnings } = makeLogger();
		const r = createVariantRegistry(logger);
		r.register("neutral", stubFactory("neutral"));
		expect(r.resolve("Z")).toBe("neutral");
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("unknown");
	});

	test("warns and falls back when requested id is known but not registered", () => {
		const { logger, warnings } = makeLogger();
		const r = createVariantRegistry(logger);
		r.register("neutral", stubFactory("neutral"));
		expect(r.resolve("A")).toBe("neutral");
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain('"A" is not registered');
	});

	test("throws if the fallback itself is not registered", () => {
		const { logger } = makeLogger();
		const r = createVariantRegistry(logger);
		expect(() => r.resolve("A")).toThrow(/fallback "neutral" is not registered/);
	});

	test("create() invokes the registered factory", () => {
		const r = createVariantRegistry();
		r.register("neutral", stubFactory("neutral"));
		const ctx = {} as VariantContext;
		const mod = r.create("neutral", ctx);
		expect(mod.id).toBe("neutral");
	});

	test("create() throws when no factory is registered", () => {
		const r = createVariantRegistry();
		expect(() => r.create("A", {} as VariantContext)).toThrow(/no factory registered/);
	});
});
