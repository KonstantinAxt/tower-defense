import type { SpriteMap } from "../assets/loader";
import {
	BG_TILE_SIZE,
	BUILD_SLOTS,
	BUILD_SLOT_RADIUS,
	CANVAS_HEIGHT,
	CANVAS_WIDTH,
	PATH,
	PATH_WIDTH,
} from "../level";

export function renderScene(ctx: CanvasRenderingContext2D, sprites: SpriteMap): void {
	drawBackground(ctx, sprites);
	drawPath(ctx, sprites);
	drawBuildSlots(ctx, sprites);
}

function drawBackground(ctx: CanvasRenderingContext2D, sprites: SpriteMap): void {
	const grass = sprites.get("tile_grass");
	if (grass) {
		for (let y = 0; y < CANVAS_HEIGHT; y += BG_TILE_SIZE) {
			for (let x = 0; x < CANVAS_WIDTH; x += BG_TILE_SIZE) {
				ctx.drawImage(grass, x, y, BG_TILE_SIZE, BG_TILE_SIZE);
			}
		}
		return;
	}
	ctx.fillStyle = "#3a5a3a";
	ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

function drawPath(ctx: CanvasRenderingContext2D, sprites: SpriteMap): void {
	if (PATH.length < 2) return;
	const [first, ...rest] = PATH;
	if (!first) return;

	const pathSprite = sprites.get("tile_path");
	ctx.save();
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (pathSprite) {
		const pattern = ctx.createPattern(pathSprite, "repeat");
		ctx.strokeStyle = pattern ?? "#8a7a55";
	} else {
		ctx.strokeStyle = "#8a7a55";
	}
	ctx.lineWidth = PATH_WIDTH;
	ctx.beginPath();
	ctx.moveTo(first.x, first.y);
	for (const p of rest) ctx.lineTo(p.x, p.y);
	ctx.stroke();

	ctx.strokeStyle = "rgba(40, 30, 15, 0.45)";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.restore();
}

function drawBuildSlots(ctx: CanvasRenderingContext2D, sprites: SpriteMap): void {
	const slotSprite = sprites.get("tile_slot");
	const diameter = BUILD_SLOT_RADIUS * 2;
	for (const slot of BUILD_SLOTS) {
		if (slotSprite) {
			ctx.drawImage(
				slotSprite,
				slot.x - BUILD_SLOT_RADIUS,
				slot.y - BUILD_SLOT_RADIUS,
				diameter,
				diameter,
			);
			continue;
		}
		ctx.save();
		ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
		ctx.strokeStyle = "#d8d8d8";
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.arc(slot.x, slot.y, BUILD_SLOT_RADIUS, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
}
