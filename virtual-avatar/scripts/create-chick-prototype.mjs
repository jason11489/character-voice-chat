import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const outPath = path.resolve("public/models/chick-prototype.glb");

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

function capsule(material, position, scale, rotation = [0, 0, 0], radius = 0.08, length = 0.32) {
  return mesh(new THREE.CapsuleGeometry(radius, length, 14, 28), material, position, scale, rotation);
}

function sphere(material, position, radius, scale = [1, 1, 1], segments = 64) {
  return mesh(new THREE.SphereGeometry(radius, segments, segments), material, position, scale);
}

function makeSoftBodyGeometry() {
  const geometry = new THREE.SphereGeometry(0.68, 96, 96);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const softness = 1 + Math.sin(x * 18.2 + y * 9.1) * 0.006 + Math.cos(z * 16.8 - y * 7.4) * 0.005;
    const lowerSquash = y < -0.48 ? 0.88 : 1;
    position.setXYZ(i, x * softness, y * softness * lowerSquash, z * softness);
  }

  geometry.computeVertexNormals();
  return geometry;
}

const root = new THREE.Group();
root.name = "ChickPrototype";

const feather = new THREE.MeshPhysicalMaterial({
  name: "warm fuzzy yellow",
  color: 0xffd76f,
  roughness: 0.72,
  metalness: 0,
  clearcoat: 0.08,
  clearcoatRoughness: 0.72,
});

const featherLight = new THREE.MeshPhysicalMaterial({
  name: "soft highlight yellow",
  color: 0xffec9a,
  roughness: 0.78,
  metalness: 0,
  transparent: true,
  opacity: 0.34,
});

const wing = new THREE.MeshPhysicalMaterial({
  name: "wing yellow",
  color: 0xf7bf57,
  roughness: 0.74,
  metalness: 0,
});

const black = new THREE.MeshPhysicalMaterial({
  name: "glossy black eyes",
  color: 0x111111,
  roughness: 0.18,
  metalness: 0,
  clearcoat: 0.8,
  clearcoatRoughness: 0.12,
});

const white = new THREE.MeshBasicMaterial({
  name: "eye sparkle",
  color: 0xffffff,
});

const cheek = new THREE.MeshStandardMaterial({
  name: "pink cheeks",
  color: 0xff7aa7,
  roughness: 0.64,
});

const beak = new THREE.MeshPhysicalMaterial({
  name: "soft orange beak",
  color: 0xf47b35,
  roughness: 0.5,
  metalness: 0,
  clearcoat: 0.16,
});

const foot = new THREE.MeshStandardMaterial({
  name: "tiny feet",
  color: 0xd89a4a,
  roughness: 0.7,
});

const body = mesh(makeSoftBodyGeometry(), feather, [0, 0.78, 0], [0.96, 1.02, 0.82]);
const fuzzShell = mesh(makeSoftBodyGeometry(), featherLight, [0, 0.79, 0], [0.985, 1.045, 0.845]);
body.name = "Body";
fuzzShell.name = "FuzzShell";
root.add(body, fuzzShell);

const leftWing = sphere(wing, [-0.57, 0.75, 0.03], 0.13, [0.4, 0.82, 0.28], 48);
leftWing.rotation.set(0.05, -0.08, 0.26);
leftWing.name = "LeftWing";
const rightWing = sphere(wing, [0.57, 0.75, 0.03], 0.13, [0.4, 0.82, 0.28], 48);
rightWing.rotation.set(0.05, 0.08, -0.26);
rightWing.name = "RightWing";
root.add(leftWing, rightWing);

const leftEye = sphere(black, [-0.19, 0.91, 0.62], 0.062, [0.78, 1.32, 0.45], 32);
leftEye.name = "LeftEye";
const rightEye = sphere(black, [0.19, 0.91, 0.62], 0.062, [0.78, 1.32, 0.45], 32);
rightEye.name = "RightEye";
root.add(leftEye, rightEye);
const leftSparkle = sphere(white, [-0.205, 0.94, 0.65], 0.014, [1, 1, 0.45], 16);
leftSparkle.name = "LeftEyeSparkle";
const rightSparkle = sphere(white, [0.175, 0.94, 0.65], 0.014, [1, 1, 0.45], 16);
rightSparkle.name = "RightEyeSparkle";
root.add(leftSparkle, rightSparkle);

const upperBeak = capsule(beak, [0, 0.83, 0.66], [0.95, 0.34, 0.2], [0, 0, Math.PI / 2], 0.045, 0.12);
upperBeak.name = "UpperBeak";
const lowerBeak = capsule(beak, [0, 0.79, 0.657], [0.76, 0.24, 0.16], [0, 0, Math.PI / 2], 0.035, 0.1);
lowerBeak.name = "LowerBeak";
root.add(upperBeak, lowerBeak);

const leftCheek = sphere(cheek, [-0.35, 0.82, 0.56], 0.052, [1.2, 0.78, 0.28], 32);
leftCheek.name = "LeftCheek";
const rightCheek = sphere(cheek, [0.35, 0.82, 0.56], 0.052, [1.2, 0.78, 0.28], 32);
rightCheek.name = "RightCheek";
root.add(leftCheek, rightCheek);

const topFeatherLeft = capsule(feather, [-0.09, 1.47, 0.02], [0.58, 0.96, 0.58], [0.12, 0, -0.42], 0.045, 0.22);
topFeatherLeft.name = "TopFeatherLeft";
const topFeatherMid = capsule(feather, [0.02, 1.51, 0.01], [0.58, 1.08, 0.58], [0.04, 0, 0.04], 0.045, 0.22);
topFeatherMid.name = "TopFeatherMid";
const topFeatherRight = capsule(feather, [0.11, 1.46, 0.02], [0.58, 0.9, 0.58], [0.1, 0, 0.42], 0.045, 0.2);
topFeatherRight.name = "TopFeatherRight";
root.add(topFeatherLeft, topFeatherMid, topFeatherRight);

const leftFoot = capsule(foot, [-0.18, 0.13, 0.18], [0.82, 0.28, 0.5], [0, 0.05, Math.PI / 2], 0.055, 0.15);
leftFoot.name = "LeftFoot";
const rightFoot = capsule(foot, [0.18, 0.13, 0.18], [0.82, 0.28, 0.5], [0, -0.05, Math.PI / 2], 0.055, 0.15);
rightFoot.name = "RightFoot";
root.add(leftFoot, rightFoot);

root.traverse((node) => {
  if (node.isMesh) {
    node.castShadow = true;
    node.receiveShadow = true;
  }
});

root.position.y = -0.08;

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(root, {
  binary: true,
  trs: false,
  onlyVisible: true,
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(outPath);
