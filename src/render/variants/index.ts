import { createHolographicVariant } from "./a-holographic";
import { createDiegeticVariant } from "./b-diegetic";
import { createArcadeVariant } from "./c-arcade";
import { createNeutralVariant } from "./neutral";
import { type RegistryLogger, type VariantRegistry, createVariantRegistry } from "./registry";

export type {
	ParticleEvent,
	VariantContext,
	VariantFactory,
	VariantHud,
	VariantId,
	VariantModule,
} from "./types";
export { readUiParam, createVariantRegistry } from "./registry";
export type { RegistryLogger, VariantRegistry } from "./registry";
export { createNeutralVariant } from "./neutral";
export { createHolographicVariant } from "./a-holographic";
export { createDiegeticVariant } from "./b-diegetic";
export { createArcadeVariant } from "./c-arcade";

// Builds the registry seeded with every variant available in the build. A
// (holographic) is the default; B (diegetic) renders under `?ui=B`;
// C (arcade pop) renders under `?ui=C`; `neutral` is the safe fallback.
export function createDefaultRegistry(logger?: RegistryLogger): VariantRegistry {
	const registry = createVariantRegistry(logger);
	registry.register("neutral", createNeutralVariant);
	registry.register("A", createHolographicVariant);
	registry.register("B", createDiegeticVariant);
	registry.register("C", createArcadeVariant);
	return registry;
}
