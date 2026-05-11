import type { VariantContext, VariantFactory, VariantId, VariantModule } from "./types";

const FALLBACK_ID: VariantId = "neutral";
const DEFAULT_ID: VariantId = "A";
const VALID_IDS: ReadonlySet<string> = new Set<VariantId>(["A", "B", "C", "neutral"]);

export interface VariantRegistry {
	register(id: VariantId, factory: VariantFactory): void;
	has(id: VariantId): boolean;
	resolve(requested: string | null | undefined): VariantId;
	create(id: VariantId, ctx: VariantContext): VariantModule;
}

// Logger seam so tests can capture warnings without polluting bun's stderr.
export interface RegistryLogger {
	warn(message: string): void;
}

const consoleLogger: RegistryLogger = {
	warn(message) {
		console.warn(message);
	},
};

export function createVariantRegistry(logger: RegistryLogger = consoleLogger): VariantRegistry {
	const factories = new Map<VariantId, VariantFactory>();

	return {
		register(id, factory) {
			factories.set(id, factory);
		},
		has(id) {
			return factories.has(id);
		},
		// Picks the variant id to boot. Unknown values and unregistered known
		// values both fall back to `neutral` (with a warning). The fallback is
		// hard-required to be registered — that's a programmer error if not.
		resolve(requested) {
			const normalized: VariantId =
				requested && VALID_IDS.has(requested) ? (requested as VariantId) : DEFAULT_ID;

			if (requested && !VALID_IDS.has(requested)) {
				logger.warn(`[variants] unknown ?ui=${requested}; falling back to "${FALLBACK_ID}"`);
				return ensureFallback(factories, logger);
			}

			if (factories.has(normalized)) return normalized;

			logger.warn(
				`[variants] variant "${normalized}" is not registered; falling back to "${FALLBACK_ID}"`,
			);
			return ensureFallback(factories, logger);
		},
		create(id, ctx) {
			const factory = factories.get(id);
			if (!factory) throw new Error(`[variants] no factory registered for "${id}"`);
			return factory(ctx);
		},
	};
}

function ensureFallback(
	factories: Map<VariantId, VariantFactory>,
	logger: RegistryLogger,
): VariantId {
	if (factories.has(FALLBACK_ID)) return FALLBACK_ID;
	logger.warn(`[variants] fallback "${FALLBACK_ID}" is not registered`);
	throw new Error(`[variants] fallback "${FALLBACK_ID}" is not registered`);
}

// Reads `?ui=` from a URL-shaped string; null-safe so test code can pass
// `window.location.search` directly (which is "" when absent).
export function readUiParam(search: string | null | undefined): string | null {
	if (!search) return null;
	const query = search.startsWith("?") ? search.slice(1) : search;
	const params = new URLSearchParams(query);
	return params.get("ui");
}
