import { createHolographicVariant } from "./a-holographic";
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

// Builds the registry seeded with every variant available in the build. A
// (holographic) is the default; `neutral` remains as the safe fallback for
// unsupported requests or while B/C variants are still in flight.
export function createDefaultRegistry(logger?: RegistryLogger): VariantRegistry {
	const registry = createVariantRegistry(logger);
	registry.register("neutral", createNeutralVariant);
	registry.register("A", createHolographicVariant);
	return registry;
}
