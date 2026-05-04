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
