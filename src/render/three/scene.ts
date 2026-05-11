import {
	AmbientLight,
	DirectionalLight,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Raycaster,
	Scene,
	Vector2,
	WebGLRenderer,
} from "three";
import { CANVAS_HEIGHT, CANVAS_WIDTH, type Point } from "../../level";
import { gameFromWorldHit } from "./coords";

export interface ThreeScene {
	readonly renderer: WebGLRenderer;
	readonly scene: Scene;
	readonly camera: PerspectiveCamera;
	readonly ground: Mesh;
	render(): void;
	pickGroundFromEvent(e: MouseEvent): Point | null;
	dispose(): void;
}

export function createThreeScene(canvas: HTMLCanvasElement): ThreeScene {
	const renderer = new WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(typeof window !== "undefined" ? window.devicePixelRatio : 1);
	renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
	renderer.setClearColor(0x202428);

	const scene = new Scene();

	const camera = new PerspectiveCamera(60, CANVAS_WIDTH / CANVAS_HEIGHT, 1, 4000);
	camera.position.set(CANVAS_WIDTH / 2, 200, CANVAS_HEIGHT + 400);
	camera.lookAt(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);

	const groundGeometry = new PlaneGeometry(CANVAS_WIDTH, CANVAS_HEIGHT);
	const groundMaterial = new MeshStandardMaterial({ color: 0x3a5a3a });
	const ground = new Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
	scene.add(ground);

	scene.add(new AmbientLight(0xffffff, 0.55));
	const sun = new DirectionalLight(0xffffff, 0.85);
	sun.position.set(CANVAS_WIDTH / 2 - 200, 600, CANVAS_HEIGHT / 2 - 200);
	sun.target.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
	scene.add(sun);
	scene.add(sun.target);

	const raycaster = new Raycaster();
	const ndc = new Vector2();

	return {
		renderer,
		scene,
		camera,
		ground,
		render() {
			renderer.render(scene, camera);
		},
		pickGroundFromEvent(e: MouseEvent): Point | null {
			const rect = canvas.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return null;
			ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
			raycaster.setFromCamera(ndc, camera);
			const hits = raycaster.intersectObject(ground, false);
			const hit = hits[0];
			if (!hit) return null;
			return gameFromWorldHit(hit.point);
		},
		dispose() {
			groundGeometry.dispose();
			groundMaterial.dispose();
			renderer.dispose();
		},
	};
}
