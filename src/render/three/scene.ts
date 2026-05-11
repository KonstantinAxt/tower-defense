import {
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	PlaneGeometry,
	Scene,
	WebGLRenderer,
} from "three";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../../level";

export interface ThreeScene {
	readonly renderer: WebGLRenderer;
	readonly scene: Scene;
	readonly camera: PerspectiveCamera;
	render(): void;
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
	const groundMaterial = new MeshBasicMaterial({ color: 0x3a5a3a });
	const ground = new Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = -Math.PI / 2;
	ground.position.set(CANVAS_WIDTH / 2, 0, CANVAS_HEIGHT / 2);
	scene.add(ground);

	return {
		renderer,
		scene,
		camera,
		render() {
			renderer.render(scene, camera);
		},
		dispose() {
			groundGeometry.dispose();
			groundMaterial.dispose();
			renderer.dispose();
		},
	};
}
