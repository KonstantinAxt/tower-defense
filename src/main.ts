const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

function frame(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
	ctx.fillStyle = "#2a2a2a";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#888";
	ctx.font = "24px system-ui, sans-serif";
	ctx.fillText("tower-defense: ready", 24, 40);
	requestAnimationFrame(() => frame(ctx, canvas));
}

frame(ctx, canvas);
