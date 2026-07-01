import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";

function softenMaterials(root) {
  root.traverse((node) => {
    const materials = Array.isArray(node.material) ? node.material : [node.material];

    materials.forEach((material) => {
      if (!material) return;

      if ("metalness" in material) {
        material.metalness = Math.min(material.metalness ?? 0, 0.03);
      }

      if ("roughness" in material) {
        material.roughness = Math.max(material.roughness ?? 0.72, 0.72);
      }

      if ("clearcoat" in material) {
        material.clearcoat = 0;
      }

      if ("clearcoatRoughness" in material) {
        material.clearcoatRoughness = 1;
      }

      if ("envMapIntensity" in material) {
        material.envMapIntensity = Math.min(material.envMapIntensity ?? 0.25, 0.25);
      }

      material.needsUpdate = true;
    });
  });
}

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

      softenMaterials(vrm.scene);
      vrm.scene.rotation.y = Math.PI - 0.22;
      scene.add(vrm.scene);
      onLoaded(vrm);
    },
    undefined,
    (error) => {
      onError?.(error);
    }
  );
}
