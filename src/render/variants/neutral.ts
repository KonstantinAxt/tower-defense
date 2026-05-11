import { createNeutralRenderer } from "../three/neutral";
import type { VariantContext, VariantModule } from "./types";

// Adapts the existing `NeutralRenderer` to the `VariantModule` shape. This
// variant is intentionally minimal: scene lighting and ground are owned by
// `createThreeScene`, so the optional `applyMaterials`/`setupLighting`/etc.
// hooks are no-ops and omitted. A/B/C variants will provide them.
export function createNeutralVariant(ctx: VariantContext): VariantModule {
	const renderer = createNeutralRenderer(ctx.scene, ctx.models);
	return {
		id: "neutral",
		update(world) {
			renderer.update(world);
		},
		dispose() {
			renderer.dispose();
		},
	};
}
