import { describe, expect, test } from "bun:test";

describe("sanity", () => {
	test("bun test runs in this repo", () => {
		expect(1 + 1).toBe(2);
	});
});
