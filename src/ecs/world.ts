export type Entity = number;
export type ComponentType = string;

export class World {
	private nextId: Entity = 1;
	private readonly alive = new Set<Entity>();
	private readonly stores = new Map<ComponentType, Map<Entity, unknown>>();

	createEntity(): Entity {
		const id = this.nextId++;
		this.alive.add(id);
		return id;
	}

	destroyEntity(entity: Entity): void {
		if (!this.alive.delete(entity)) return;
		for (const store of this.stores.values()) {
			store.delete(entity);
		}
	}

	hasEntity(entity: Entity): boolean {
		return this.alive.has(entity);
	}

	entityCount(): number {
		return this.alive.size;
	}

	addComponent<T>(entity: Entity, type: ComponentType, component: T): void {
		if (!this.alive.has(entity)) {
			throw new Error(`addComponent: entity ${entity} is not alive`);
		}
		let store = this.stores.get(type);
		if (!store) {
			store = new Map();
			this.stores.set(type, store);
		}
		store.set(entity, component);
	}

	getComponent<T>(entity: Entity, type: ComponentType): T | undefined {
		return this.stores.get(type)?.get(entity) as T | undefined;
	}

	hasComponent(entity: Entity, type: ComponentType): boolean {
		return this.stores.get(type)?.has(entity) ?? false;
	}

	removeComponent(entity: Entity, type: ComponentType): boolean {
		return this.stores.get(type)?.delete(entity) ?? false;
	}

	query(...types: ComponentType[]): Entity[] {
		if (types.length === 0) return [...this.alive];

		const stores: Map<Entity, unknown>[] = [];
		for (const type of types) {
			const store = this.stores.get(type);
			if (!store) return [];
			stores.push(store);
		}

		let smallest = stores[0];
		if (!smallest) return [];
		for (const store of stores) {
			if (store.size < smallest.size) smallest = store;
		}

		const result: Entity[] = [];
		outer: for (const entity of smallest.keys()) {
			for (const store of stores) {
				if (!store.has(entity)) continue outer;
			}
			result.push(entity);
		}
		return result;
	}
}
