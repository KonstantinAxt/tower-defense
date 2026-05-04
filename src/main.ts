import { SystemRunner, World } from "./ecs";
import { Loop } from "./loop";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("#game canvas not found");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const world = new World();
const systems = new SystemRunner();

const loop = new Loop(
	(dt) => systems.run(world, dt),
	(_alpha) => {
		ctx.fillStyle = "#2a2a2a";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = "#888";
		ctx.font = "24px system-ui, sans-serif";
		ctx.fillText("tower-defense: ready", 24, 40);
	},
	{ fixedDt: 1 / 60 },
);

function tick(nowMs: number): void {
	loop.step(nowMs);
	requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
