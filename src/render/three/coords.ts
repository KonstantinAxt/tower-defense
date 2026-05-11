import { Vector3 } from "three";
import type { Point } from "../../level";

// Game coords are 2D (x, y) in canvas pixels with y pointing down.
// Three.js world coords are 3D; we map game-y onto world-z and keep the
// ground at y=0 so towers, slots and enemies live on the XZ plane.
export function worldFromGameCoord(p: Point): Vector3 {
	return new Vector3(p.x, 0, p.y);
}

export function gameFromWorldHit(hit: Vector3): Point {
	return { x: hit.x, y: hit.z };
}
