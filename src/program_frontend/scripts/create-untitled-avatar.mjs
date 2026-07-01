import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

const sourcePath = process.argv[2] || "/Users/saeran/Downloads/Untitled.obj";
const materialPath = process.argv[3] || "/Users/saeran/Downloads/Untitled.mtl";
const outPath = path.resolve("public/models/untitled-colored.glb");

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

const mtlLoader = new MTLLoader();
mtlLoader.setResourcePath(path.dirname(materialPath) + path.sep);
const materials = mtlLoader.parse(fs.readFileSync(materialPath, "utf8"), path.dirname(materialPath) + path.sep);
materials.preload();

const objLoader = new OBJLoader();
objLoader.setMaterials(materials);
const loaded = objLoader.parse(fs.readFileSync(sourcePath, "utf8"));

const root = new THREE.Group();
root.name = "UntitledColoredAvatar";
const imported = new THREE.Group();
imported.name = "ImportedBodyGroup";
root.add(imported);

const seenGeometry = new Set();

loaded.traverse((node) => {
  if (!node.isMesh) return;
  node.geometry.computeBoundingBox();
  const nodeBox = node.geometry.boundingBox;
  const geometryKey = [
    node.geometry.attributes.position.count,
    nodeBox.min.toArray().map((value) => value.toFixed(4)).join(","),
    nodeBox.max.toArray().map((value) => value.toFixed(4)).join(","),
  ].join("|");

  if (seenGeometry.has(geometryKey)) return;
  seenGeometry.add(geometryKey);

  const body = node.clone();
  body.name = node.name === "white_mesh" ? "Body" : node.name || "Body";
  body.castShadow = true;
  body.receiveShadow = true;

  const smoothGeometry = mergeVertices(node.geometry.clone(), 0.0001);
  smoothGeometry.computeVertexNormals();
  body.geometry = smoothGeometry;
  body.material = new THREE.MeshPhysicalMaterial({
    name: "warm bright chick body",
    color: 0xffd84f,
    roughness: 0.46,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.36,
    sheen: 0.28,
    sheenRoughness: 0.72,
  });

  imported.add(body);
});

const box = new THREE.Box3().setFromObject(imported);
const size = new THREE.Vector3();
const center = new THREE.Vector3();
box.getSize(size);
box.getCenter(center);

imported.position.sub(center);
const targetHeight = 1.48;
const scale = targetHeight / Math.max(size.y, 0.001);
imported.scale.setScalar(scale);

const normalizedBox = new THREE.Box3().setFromObject(imported);
imported.position.y += 0.12 - normalizedBox.min.y;

imported.updateMatrixWorld(true);

function collectSurfacePoints(group) {
  const points = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      points.push(node.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
    }
  });
  return points;
}

const surfacePoints = collectSurfacePoints(imported);

function frontSurfaceAt(x, y, radius = 0.07) {
  let best = null;
  let bestDistance = Infinity;

  for (const point of surfacePoints) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance > radius) continue;
    if (!best || point.z > best.z || (point.z === best.z && distance < bestDistance)) {
      best = point;
      bestDistance = distance;
    }
  }

  if (best) {
    return best.clone().add(new THREE.Vector3(0, 0, 0.026));
  }

  return new THREE.Vector3(x, y, 0.65);
}

const leftEyePosition = frontSurfaceAt(-0.21, 0.93, 0.09);
const rightEyePosition = frontSurfaceAt(0.21, 0.93, 0.09);
const beakPosition = frontSurfaceAt(0, 0.81, 0.075);
const lowerBeakPosition = frontSurfaceAt(0, 0.765, 0.075);
const leftCheekPosition = frontSurfaceAt(-0.33, 0.77, 0.1);
const rightCheekPosition = frontSurfaceAt(0.33, 0.77, 0.1);

const leftEye = sphere(black, leftEyePosition.toArray(), 0.062, [0.82, 1.2, 0.34]);
leftEye.name = "LeftEye";
const rightEye = sphere(black, rightEyePosition.toArray(), 0.062, [0.82, 1.2, 0.34]);
rightEye.name = "RightEye";
const leftSparkle = sphere(white, leftEyePosition.clone().add(new THREE.Vector3(-0.017, 0.024, 0.022)).toArray(), 0.013, [1, 1, 0.42]);
leftSparkle.name = "LeftEyeSparkle";
const rightSparkle = sphere(white, rightEyePosition.clone().add(new THREE.Vector3(-0.017, 0.024, 0.022)).toArray(), 0.013, [1, 1, 0.42]);
rightSparkle.name = "RightEyeSparkle";

const upperBeak = capsule(orange, beakPosition.toArray(), [0.92, 0.34, 0.2], [0, 0, Math.PI / 2], 0.042, 0.11);
upperBeak.name = "UpperBeak";
const lowerBeak = capsule(orange, lowerBeakPosition.clone().add(new THREE.Vector3(0, -0.012, 0.004)).toArray(), [0.74, 0.22, 0.16], [0, 0, Math.PI / 2], 0.032, 0.08);
lowerBeak.name = "LowerBeak";

const leftCheek = sphere(pink, leftCheekPosition.toArray(), 0.052, [1.28, 0.78, 0.24]);
leftCheek.name = "LeftCheek";
const rightCheek = sphere(pink, rightCheekPosition.toArray(), 0.052, [1.28, 0.78, 0.24]);
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
