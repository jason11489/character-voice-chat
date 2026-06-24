import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

export function loadVRM(url, scene, onLoaded, onError) {
  const loader = new GLTFLoader();

  loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
  });

  loader.load(
    url,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      if (!vrm) {
        onError?.(new Error("VRM data was not found in GLTF userData."));
        return;
      }

      vrm.scene.rotation.y = Math.PI;
      scene.add(vrm.scene);
      onLoaded(vrm);
    },
    undefined,
    (error) => {
      onError?.(error);
    }
  );
}