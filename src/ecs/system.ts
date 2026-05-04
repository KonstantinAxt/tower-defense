import type { World } from "./world";

export type System = (world: World, dt: number) => void;

export class SystemRunner {
	private readonly systems: System[] = [];

	add(system: System): void {
		this.systems.push(system);
	}

	clear(): void {
		this.systems.length = 0;
	}

	count(): number {
		return this.systems.length;
	}

	run(world: World, dt: number): void {
		for (const system of this.systems) {
			system(world, dt);
		}
	}
}
