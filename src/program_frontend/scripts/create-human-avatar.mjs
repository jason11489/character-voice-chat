import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const sourcePath = process.argv[2] || "/Users/saeran/Downloads/girl.obj";
const explicitMaterialPath = process.argv[3]?.endsWith(".mtl") ? process.argv[3] : "";
const inferredMaterialPath = path.join(path.dirname(sourcePath), `${path.basename(sourcePath, path.extname(sourcePath))}.mtl`);
const materialPath = explicitMaterialPath || (fs.existsSync(inferredMaterialPath) ? inferredMaterialPath : "");
const outPath = path.resolve(
  explicitMaterialPath ? process.argv[4] || "public/models/human-cute.glb" : process.argv[3] || "public/models/human-cute.glb"
);

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
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

function sphere(material, position, radius, scale = [1, 1, 1]) {
  return mesh(new THREE.SphereGeometry(radius, 40, 40), material, position, scale);
}

function capsule(material, position, scale, rotation = [0, 0, 0], radius = 0.04, length = 0.1) {
  return mesh(new THREE.CapsuleGeometry(radius, length, 14, 28), material, position, scale, rotation);
}

function tube(points, material, radius = 0.012) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const node = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 10, false), material);
  node.castShadow = true;
  node.receiveShadow = true;
  return node;
}

const skin = new THREE.Color(0xffaaa7);
const skinLight = new THREE.Color(0xffd4cc);
const hair = new THREE.Color(0xe3420a);
const hairShadow = new THREE.Color(0xd7532c);

const bodyMaterial = new THREE.MeshPhysicalMaterial({
  name: "peach skin and orange hair",
  vertexColors: true,
  roughness: 0.42,
  metalness: 0,
  clearcoat: 0.34,
  clearcoatRoughness: 0.3,
});

const faceSurfaceMaterial = new THREE.MeshPhysicalMaterial({
  name: "girl face surface",
  color: skin,
  roughness: 0.42,
  metalness: 0,
  clearcoat: 0.34,
  clearcoatRoughness: 0.3,
});
faceSurfaceMaterial.userData.sourceName = "face";

const hairSurfaceMaterial = new THREE.MeshPhysicalMaterial({
  name: "girl hair surface",
  color: hair,
  roughness: 0.36,
  metalness: 0,
  clearcoat: 0.42,
  clearcoatRoughness: 0.26,
});
hairSurfaceMaterial.userData.sourceName = "hair";

const hairMaterial = new THREE.MeshPhysicalMaterial({
  name: "soft orange hair",
  color: hair,
  roughness: 0.36,
  metalness: 0,
  clearcoat: 0.42,
  clearcoatRoughness: 0.26,
});

const innerEarMaterial = new THREE.MeshPhysicalMaterial({
  name: "soft inner ear",
  color: 0xff9fa8,
  roughness: 0.5,
  metalness: 0,
  clearcoat: 0.16,
});

const black = new THREE.MeshPhysicalMaterial({
  name: "glossy black eyes",
  color: 0x111111,
  roughness: 0.12,
  clearcoat: 0.82,
  clearcoatRoughness: 0.1,
});

const white = new THREE.MeshBasicMaterial({
  name: "eye sparkle",
  color: 0xffffff,
});

const pink = new THREE.MeshStandardMaterial({
  name: "soft pink cheeks",
  color: 0xff6f98,
  roughness: 0.58,
});

const lip = new THREE.MeshStandardMaterial({
  name: "soft smile",
  color: 0x8e3f4b,
  roughness: 0.54,
});

const noseMaterial = new THREE.MeshPhysicalMaterial({
  name: "tiny peach nose",
  color: 0xff8f82,
  roughness: 0.42,
  clearcoat: 0.18,
});

function colorizeGeometry(geometry) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const size = new THREE.Vector3().subVectors(max, min);
  const positions = geometry.attributes.position;
  const colors = [];
  const mixed = new THREE.Color();

  for (let index = 0; index < positions.count; index += 1) {
    const x = (positions.getX(index) - min.x) / Math.max(size.x, 0.001);
    const y = (positions.getY(index) - min.y) / Math.max(size.y, 0.001);
    const z = (positions.getZ(index) - min.z) / Math.max(size.z, 0.001);
    const isTopHair = y > 0.66;
    const isSideHair = y > 0.58 && z < 0.48 && (x < 0.24 || x > 0.76);
    const isBackHair = y > 0.62 && z < 0.3;

    if (isTopHair || isSideHair || isBackHair) {
      mixed.copy(hair).lerp(hairShadow, Math.max(0, 0.55 - z) * 0.55);
    } else {
      mixed.copy(skin).lerp(skinLight, Math.max(0, z - 0.45) * 0.42);
    }

    colors.push(mixed.r, mixed.g, mixed.b);
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

function materialForSource(sourceName) {
  if (sourceName === "hair") return hairSurfaceMaterial;
  if (sourceName === "face") return faceSurfaceMaterial;
  return bodyMaterial;
}

function cloneGeometryRange(sourceGeometry, start, count) {
  const geometry = new THREE.BufferGeometry();

  for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
    const itemSize = attribute.itemSize;
    const TypedArray = attribute.array.constructor;
    const from = start * itemSize;
    const to = (start + count) * itemSize;
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(new TypedArray(attribute.array.slice(from, to)), itemSize, attribute.normalized)
    );
  }

  return geometry;
}

function loadObj() {
  const loader = new OBJLoader();

  if (materialPath) {
    const materials = new MTLLoader().parse(fs.readFileSync(materialPath, "utf8"), `${path.dirname(materialPath)}${path.sep}`);
    materials.preload();
    loader.setMaterials(materials);
  }

  return loader.parse(fs.readFileSync(sourcePath, "utf8"));
}

const loaded = loadObj();
const root = new THREE.Group();
root.name = "CuteHumanAvatar";

const imported = new THREE.Group();
imported.name = "ImportedBodyGroup";
root.add(imported);

let bodyIndex = 0;
loaded.traverse((node) => {
  if (!node.isMesh) return;
  const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
  const hasNamedSourceMaterials = sourceMaterials.some((material) => material?.name === "face" || material?.name === "hair");

  if (hasNamedSourceMaterials && node.geometry.groups.length) {
    const bodyGroup = new THREE.Group();
    bodyGroup.name = bodyIndex === 0 ? "Body" : `Body_${bodyIndex}`;
    bodyIndex += 1;

    node.geometry.groups.forEach((groupRange, groupIndex) => {
      const sourceName = sourceMaterials[groupRange.materialIndex]?.name || "body";
      const partGeometry = cloneGeometryRange(node.geometry, groupRange.start, groupRange.count);
      partGeometry.computeVertexNormals();
      const part = new THREE.Mesh(partGeometry, materialForSource(sourceName));
      part.name = sourceName === "hair" ? "BodyHair" : sourceName === "face" ? "BodyFace" : `BodyPart_${groupIndex + 1}`;
      part.castShadow = true;
      part.receiveShadow = true;
      bodyGroup.add(part);
    });

    imported.add(bodyGroup);
    return;
  }

  const body = node.clone();
  body.name = bodyIndex === 0 ? "Body" : `Body_${bodyIndex}`;
  bodyIndex += 1;

  const smoothGeometry = hasNamedSourceMaterials ? node.geometry.clone() : mergeVertices(node.geometry.clone(), 0.0001);
  smoothGeometry.computeVertexNormals();
  body.geometry = smoothGeometry;
  if (hasNamedSourceMaterials) {
    body.material = sourceMaterials.map((material) => materialForSource(material?.name));
  } else {
    colorizeGeometry(smoothGeometry);
    body.material = bodyMaterial;
  }
  body.castShadow = true;
  body.receiveShadow = true;
  imported.add(body);
});

const box = new THREE.Box3().setFromObject(imported);
const size = new THREE.Vector3();
const center = new THREE.Vector3();
box.getSize(size);
box.getCenter(center);

imported.position.sub(center);
const targetHeight = 1.54;
const scale = targetHeight / Math.max(size.y, 0.001);
imported.scale.setScalar(scale);

const normalizedBox = new THREE.Box3().setFromObject(imported);
imported.position.y += 0.12 - normalizedBox.min.y;
imported.updateMatrixWorld(true);

function collectSurfacePoints(group, sourceName = "") {
  const points = [];
  group.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;

    if (sourceName && !Array.isArray(node.material)) {
      if (node.material?.userData?.sourceName !== sourceName) return;
      for (let index = 0; index < position.count; index += 1) {
        points.push(node.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
      }
      return;
    }

    if (sourceName && Array.isArray(node.material) && node.geometry.groups.length) {
      for (const groupRange of node.geometry.groups) {
        const material = node.material[groupRange.materialIndex];
        if (material?.userData?.sourceName !== sourceName) continue;
        const end = groupRange.start + groupRange.count;
        for (let index = groupRange.start; index < end; index += 1) {
          points.push(node.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
        }
      }
      return;
    }

    for (let index = 0; index < position.count; index += 1) {
      points.push(node.localToWorld(new THREE.Vector3().fromBufferAttribute(position, index)));
    }
  });
  return points;
}

const surfacePoints = collectSurfacePoints(imported);
const faceSurfacePoints = collectSurfacePoints(imported, "face");
const featureSurfacePoints = faceSurfacePoints.length ? faceSurfacePoints : surfacePoints;

function frontSurfaceAt(x, y, radius = 0.08, points = featureSurfacePoints) {
  let best = null;
  let bestDistance = Infinity;

  for (const point of points) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance > radius) continue;
    if (!best || point.z > best.z || (point.z === best.z && distance < bestDistance)) {
      best = point;
      bestDistance = distance;
    }
  }

  if (best) {
    return best.clone().add(new THREE.Vector3(0, 0, 0.028));
  }

  return new THREE.Vector3(x, y, 0.58);
}

const featureZ = 0.675;
const leftEyePosition = new THREE.Vector3(-0.115, 0.675, featureZ);
const rightEyePosition = new THREE.Vector3(0.115, 0.675, featureZ);
const nosePosition = new THREE.Vector3(0, 0.585, featureZ + 0.008);
const mouthPosition = new THREE.Vector3(0, 0.515, featureZ + 0.01);
const leftCheekPosition = new THREE.Vector3(-0.25, 0.585, featureZ - 0.01);
const rightCheekPosition = new THREE.Vector3(0.25, 0.585, featureZ - 0.01);

const leftEye = sphere(black, leftEyePosition.toArray(), 0.046, [0.86, 1.08, 0.28]);
leftEye.name = "LeftEye";
const rightEye = sphere(black, rightEyePosition.toArray(), 0.046, [0.86, 1.08, 0.28]);
rightEye.name = "RightEye";
const leftSparkle = sphere(white, leftEyePosition.clone().add(new THREE.Vector3(-0.015, 0.02, 0.018)).toArray(), 0.011, [1, 1, 0.36]);
leftSparkle.name = "LeftEyeSparkle";
const rightSparkle = sphere(white, rightEyePosition.clone().add(new THREE.Vector3(-0.015, 0.02, 0.018)).toArray(), 0.011, [1, 1, 0.36]);
rightSparkle.name = "RightEyeSparkle";

const nose = sphere(noseMaterial, nosePosition.toArray(), 0.027, [1.08, 0.78, 0.28]);
nose.name = "Nose";
const mouth = tube(
  [
    mouthPosition.clone().add(new THREE.Vector3(-0.055, 0.008, 0)).toArray(),
    mouthPosition.clone().add(new THREE.Vector3(0, -0.012, 0.01)).toArray(),
    mouthPosition.clone().add(new THREE.Vector3(0.055, 0.008, 0)).toArray(),
  ],
  lip,
  0.01
);
mouth.name = "Mouth";

const leftCheek = sphere(pink, leftCheekPosition.toArray(), 0.04, [1.44, 0.56, 0.16]);
leftCheek.name = "LeftCheek";
const rightCheek = sphere(pink, rightCheekPosition.toArray(), 0.04, [1.44, 0.56, 0.16]);
rightCheek.name = "RightCheek";

root.add(
  leftEye,
  rightEye,
  leftSparkle,
  rightSparkle,
  nose,
  mouth,
  leftCheek,
  rightCheek
);

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(root, {
  binary: true,
  trs: false,
  onlyVisible: true,
});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.from(arrayBuffer));
console.log(outPath);
