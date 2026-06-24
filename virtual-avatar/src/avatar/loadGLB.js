import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function loadGLB(url, scene, onLoaded, onError) {
  const loader = new GLTFLoader();

  loader.load(
    url,
    (gltf) => {
      scene.add(gltf.scene);
      onLoaded(gltf.scene);
    },
    undefined,
    (error) => {
      onError?.(error);
    }
  );
}
