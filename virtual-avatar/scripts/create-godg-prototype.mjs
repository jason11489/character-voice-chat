import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const outPath = path.resolve("public/models/godg-prototype.glb");

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

function capsule(material, position, scale, rotation = [0, 0, 0]) {
  return mesh(new THREE.CapsuleGeometry(0.08, 0.42, 16, 32), material, position, scale, rotation);
}

function dot(material, position, radius, scale = [1, 1, 1]) {
  return mesh(new THREE.SphereGeometry(radius, 32, 32), material, position, scale);
}

function tube(points, material, radius = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 8, false), material);
}

const root = new THREE.Group();
root.name = "GodgPrototype";

const white = new THREE.MeshPhysicalMaterial({
  name: "soft warm white",
  color: 0xfffbf4,
  roughness: 0.48,
  metalness: 0,
  clearcoat: 0.28,
  clearcoatRoughness: 0.38,
});

const shadowWhite = new THREE.MeshPhysicalMaterial({
  name: "soft shadow white",
  color: 0xf1e9dd,
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0.18,
});

const black = new THREE.MeshStandardMaterial({
  name: "ink black",
  color: 0x151515,
  roughness: 0.54,
});

const pink = new THREE.MeshStandardMaterial({
  name: "cheek pink",
  color: 0xff668c,
  roughness: 0.58,
});

const red = new THREE.MeshStandardMaterial({
  name: "scarf red",
  color: 0xe84a64,
  roughness: 0.48,
});

const line = new THREE.MeshStandardMaterial({
  name: "soft line",
  color: 0x5f4f4f,
  roughness: 0.62,
});

const body = mesh(new THREE.SphereGeometry(0.56, 64, 64), shadowWhite, [0, 0.58, 0], [0.86, 0.92, 0.68]);
const head = mesh(new THREE.SphereGeometry(0.62, 96, 96), white, [0, 1.15, 0.05], [1.02, 0.9, 0.78]);
root.add(body, head);

const leftEar = mesh(new THREE.SphereGeometry(0.28, 64, 64), white, [-0.49, 1.02, 0.03], [0.48, 1.12, 0.36], [0.04, -0.08, 0.32]);
const rightEar = mesh(new THREE.SphereGeometry(0.28, 64, 64), white, [0.49, 1.02, 0.03], [0.48, 1.12, 0.36], [0.04, 0.08, -0.32]);
root.add(leftEar, rightEar);

const leftBump = dot(white, [-0.34, 1.7, 0.03], 0.16, [1.05, 0.78, 0.7]);
const rightBump = dot(white, [0.34, 1.7, 0.03], 0.16, [1.05, 0.78, 0.7]);
root.add(leftBump, rightBump);

const leftEye = dot(black, [-0.18, 1.2, 0.58], 0.052, [0.82, 1.24, 0.42]);
const rightEye = dot(black, [0.18, 1.2, 0.58], 0.052, [0.82, 1.24, 0.42]);
root.add(leftEye, rightEye);
root.add(dot(white, [-0.195, 1.225, 0.605], 0.015), dot(white, [0.165, 1.225, 0.605], 0.015));

const nose = dot(black, [0, 1.08, 0.62], 0.035, [1.15, 0.8, 0.42]);
const mouth = capsule(black, [0.02, 0.99, 0.61], [0.5, 0.12, 0.16], [0, 0, -0.28]);
root.add(nose, mouth);

root.add(
  dot(pink, [-0.32, 1.58, 0.36], 0.042, [1, 0.85, 0.55]),
  dot(pink, [0.32, 1.58, 0.36], 0.042, [1, 0.85, 0.55])
);

root.add(
  tube([[-0.1, 1.48, 0.6], [-0.08, 1.43, 0.62], [-0.1, 1.38, 0.61]], line, 0.009),
  tube([[0, 1.49, 0.61], [0.02, 1.43, 0.63], [0, 1.37, 0.62]], line, 0.009),
  tube([[0.1, 1.48, 0.6], [0.12, 1.43, 0.62], [0.1, 1.38, 0.61]], line, 0.009)
);

const leftArm = capsule(white, [-0.38, 0.73, 0.45], [0.58, 0.86, 0.58], [0.22, 0.05, 0.88]);
const rightArm = capsule(white, [0.28, 0.86, 0.5], [0.42, 0.72, 0.42], [0.18, -0.12, -0.42]);
const rightFinger = capsule(white, [0.17, 0.99, 0.61], [0.22, 0.45, 0.22], [0.06, -0.1, -0.55]);
root.add(leftArm, rightArm, rightFinger);

const scarf = mesh(new THREE.SphereGeometry(0.15, 32, 32), red, [0.31, 0.55, 0.42], [1.28, 0.54, 0.22], [0.05, 0, -0.28]);
const scarfTail = mesh(new THREE.ConeGeometry(0.12, 0.28, 32), red, [0.47, 0.51, 0.42], [1, 1, 0.42], [0, 0, -1.28]);
root.add(scarf, scarfTail);

const leftFoot = capsule(shadowWhite, [-0.2, 0.12, 0.16], [0.9, 0.36, 0.62], [0, 0.08, Math.PI / 2]);
const rightFoot = capsule(shadowWhite, [0.2, 0.12, 0.16], [0.9, 0.36, 0.62], [0, -0.08, Math.PI / 2]);
root.add(leftFoot, rightFoot);

root.traverse((node) => {
  if (node.isMesh) {
    node.castShadow = true;
    node.receiveShadow = true;
  }
});

root.position.y = -0.85;
root.rotation.y = 0.02;

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(root, {
  binary: true,
  trs: false,
  onlyVisible: true,
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(outPath);
