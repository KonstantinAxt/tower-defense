import { test as base } from "@playwright/test";

export type Variant = "A" | "B" | "C";

export interface UiOptions {
	variant: Variant;
}

// Project option that lets each Playwright project pin which UI variant
// (`?ui=A|B|C`) the shared specs run against.
export const test = base.extend<UiOptions>({
	variant: ["A", { option: true }],
});

export { expect } from "@playwright/test";
