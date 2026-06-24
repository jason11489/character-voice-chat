import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const sourcePath = process.argv[2] || "/Users/saeran/Downloads/white_mesh.obj";
const outPath = path.resolve("public/models/white-mesh-colored.glb");

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer;
        this.onloadend?.({ target: this });
        this.onload?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString("base64");
        this.result = `data:${blob.type || "application/octet-stream"};base64,${base64}`;
        this.onloadend?.({ target: this });
        this.onload?.({ target: this });
      })
      .catch((error) => this.onerror?.(error));
  }
};

function mesh(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const node = new THREE.Mesh(geometry, material);
  node.position.set(...position);
  node.scale.set(...scale);
  node.rotation.set(...rotation);
  return node;
}

function capsule(material, position, scale, rotation = [0, 0, 0], radius = 0.08, length = 0.22) {
  return mesh(new THREE.CapsuleGeometry(radius, length, 14, 28), material, position, scale, rotation);
}

function sphere(material, position, radius, scale = [1, 1, 1]) {
  return mesh(new THREE.SphereGeometry(radius, 32, 32), material, position, scale);
}

const bodyMaterial = new THREE.MeshPhysicalMaterial({
  name: "warm colored mesh",
  color: 0xffd86f,
  roughness: 0.68,
  metalness: 0,
  clearcoat: 0.1,
  clearcoatRoughness: 0.58,
});

const black = new THREE.MeshPhysicalMaterial({
  name: "glossy black eyes",
  color: 0x111111,
  roughness: 0.16,
  clearcoat: 0.8,
  clearcoatRoughness: 0.12,
});

const white = new THREE.MeshBasicMaterial({
  name: "eye sparkle",
  color: 0xffffff,
});

const pink = new THREE.MeshStandardMaterial({
  name: "pink cheeks",
  color: 0xff7aa7,
  roughness: 0.62,
});

const orange = new THREE.MeshPhysicalMaterial({
  name: "orange beak",
  color: 0xf47b35,
  roughness: 0.48,
  clearcoat: 0.14,
});

const objText = fs.readFileSync(sourcePath, "utf8");
const loaded = new OBJLoader().parse(objText);
const root = new THREE.Group();
root.name = "ColoredWhiteMeshAvatar";
root.add(loaded);

loaded.traverse((node) => {
  if (!node.isMesh) return;
  node.name = node.name || "ImportedBody";
  node.material = bodyMaterial;
  node.castShadow = true;
  node.receiveShadow = true;
  node.geometry.computeVertexNormals();
});

const box = new THREE.Box3().setFromObject(loaded);
const size = new THREE.Vector3();
const center = new THREE.Vector3();
box.getSize(size);
box.getCenter(center);

loaded.position.sub(center);
const targetHeight = 1.48;
const scale = targetHeight / Math.max(size.y, 0.001);
loaded.scale.setScalar(scale);

const normalizedBox = new THREE.Box3().setFromObject(loaded);
loaded.position.y += 0.12 - normalizedBox.min.y;

const leftEye = sphere(black, [-0.18, 0.88, 0.64], 0.055, [0.78, 1.28, 0.45]);
leftEye.name = "LeftEye";
const rightEye = sphere(black, [0.18, 0.88, 0.64], 0.055, [0.78, 1.28, 0.45]);
rightEye.name = "RightEye";
const leftSparkle = sphere(white, [-0.195, 0.91, 0.665], 0.012, [1, 1, 0.45]);
leftSparkle.name = "LeftEyeSparkle";
const rightSparkle = sphere(white, [0.165, 0.91, 0.665], 0.012, [1, 1, 0.45]);
rightSparkle.name = "RightEyeSparkle";

const upperBeak = capsule(orange, [0, 0.78, 0.69], [0.88, 0.32, 0.2], [0, 0, Math.PI / 2], 0.04, 0.1);
upperBeak.name = "UpperBeak";
const lowerBeak = capsule(orange, [0, 0.735, 0.686], [0.7, 0.22, 0.16], [0, 0, Math.PI / 2], 0.032, 0.08);
lowerBeak.name = "LowerBeak";

const leftCheek = sphere(pink, [-0.33, 0.78, 0.58], 0.046, [1.22, 0.78, 0.28]);
leftCheek.name = "LeftCheek";
const rightCheek = sphere(pink, [0.33, 0.78, 0.58], 0.046, [1.22, 0.78, 0.28]);
rightCheek.name = "RightCheek";

root.add(leftEye, rightEye, leftSparkle, rightSparkle, upperBeak, lowerBeak, leftCheek, rightCheek);

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(root, {
  binary: true,
  trs: false,
  onlyVisible: true,
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(outPath);
