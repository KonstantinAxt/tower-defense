export interface Point {
	readonly x: number;
	readonly y: number;
}

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;

// Background is tiled with 64x64 grass tiles from the Kenney pack.
export const BG_TILE_SIZE = 64;

// The path is drawn as a thick stroked polyline. Entrance and exit
// waypoints sit off-canvas so enemies walk in and out cleanly.
export const PATH_WIDTH = 44;

// Fixed polyline. Enemies spawn at PATH[0] and exit at the last point.
export const PATH: readonly Point[] = [
	{ x: -30, y: 110 },
	{ x: 220, y: 110 },
	{ x: 220, y: 290 },
	{ x: 470, y: 290 },
	{ x: 470, y: 140 },
	{ x: 740, y: 140 },
	{ x: 740, y: 430 },
	{ x: 990, y: 430 },
];

// Tower build slots sit on the ground between/around path segments.
// Radius is used for both hit-testing and rendering the slot marker.
export const BUILD_SLOT_RADIUS = 22;

export const BUILD_SLOTS: readonly Point[] = [
	{ x: 120, y: 210 },
	{ x: 320, y: 200 },
	{ x: 340, y: 400 },
	{ x: 570, y: 210 },
	{ x: 620, y: 400 },
	{ x: 840, y: 230 },
	{ x: 860, y: 340 },
];

// Cumulative arc length to each waypoint. Index i is the total length from
// PATH[0] to PATH[i]; index 0 is 0.
const CUMULATIVE_LENGTHS: readonly number[] = (() => {
	const out: number[] = [0];
	for (let i = 1; i < PATH.length; i++) {
		const a = PATH[i - 1];
		const b = PATH[i];
		if (!a || !b) continue;
		const prev = out[i - 1] ?? 0;
		out.push(prev + Math.hypot(b.x - a.x, b.y - a.y));
	}
	return out;
})();

export const PATH_TOTAL_LENGTH: number = CUMULATIVE_LENGTHS[CUMULATIVE_LENGTHS.length - 1] ?? 0;

export interface PathPose {
	readonly x: number;
	readonly y: number;
	readonly dirX: number; // unit tangent, pointing toward the next waypoint
	readonly dirY: number;
}

// (x, y) and unit tangent on the polyline at `distance` from PATH[0].
// Values outside [0, PATH_TOTAL_LENGTH] clamp to the endpoints.
export function positionAtDistance(distance: number): PathPose {
	const first = PATH[0];
	if (!first) return { x: 0, y: 0, dirX: 1, dirY: 0 };
	const last = PATH[PATH.length - 1] ?? first;
	if (distance <= 0) {
		const second = PATH[1] ?? first;
		return tangentFrom(first.x, first.y, second.x, second.y, first.x, first.y);
	}
	if (distance >= PATH_TOTAL_LENGTH) {
		const prev = PATH[PATH.length - 2] ?? first;
		return tangentFrom(prev.x, prev.y, last.x, last.y, last.x, last.y);
	}
	for (let i = 1; i < PATH.length; i++) {
		const segEnd = CUMULATIVE_LENGTHS[i] ?? 0;
		if (distance <= segEnd) {
			const a = PATH[i - 1];
			const b = PATH[i];
			if (!a || !b) continue;
			const segStart = CUMULATIVE_LENGTHS[i - 1] ?? 0;
			const segLen = segEnd - segStart;
			const t = segLen === 0 ? 0 : (distance - segStart) / segLen;
			const x = a.x + (b.x - a.x) * t;
			const y = a.y + (b.y - a.y) * t;
			return tangentFrom(a.x, a.y, b.x, b.y, x, y);
		}
	}
	return { x: first.x, y: first.y, dirX: 1, dirY: 0 };
}

function tangentFrom(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	x: number,
	y: number,
): PathPose {
	const dx = bx - ax;
	const dy = by - ay;
	const len = Math.hypot(dx, dy);
	if (len === 0) return { x, y, dirX: 1, dirY: 0 };
	return { x, y, dirX: dx / len, dirY: dy / len };
}
