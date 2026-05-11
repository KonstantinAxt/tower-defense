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

// Builds the registry seeded with every variant available in the build. Today
// only `neutral` exists; A/B/C land as parallel issues and register here.
export function createDefaultRegistry(logger?: RegistryLogger): VariantRegistry {
	const registry = createVariantRegistry(logger);
	registry.register("neutral", createNeutralVariant);
	return registry;
}
