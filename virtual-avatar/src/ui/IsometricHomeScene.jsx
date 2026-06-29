import React, { useEffect, useRef } from "react";
import * as THREE from "three";

function getStatusColor(status) {
  if (status === "active") return 0x16a36d;
  if (status === "ready") return 0x4f8cff;
  return 0x98a2b3;
}

function makeDisplayMaterial(title, subtitle, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(26, 26, 460, 268);
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(70, 74, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 58px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText(title, 110, 96);
  ctx.fillStyle = hex;
  ctx.font = "900 34px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText(subtitle, 56, 184);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "800 24px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("Boss Home Ready", 56, 238);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
  });
  material.userData.texture = texture;
  return material;
}

function makeBadgeMaterial(title, color, { width = 360, height = 120 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "rgba(255,254,248,0.96)";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = "#17352d";
  ctx.font = "900 42px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.userData.texture = texture;
  return material;
}

function makeIconMaterial(title, color, { width = 240, height = 180 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = hex;
  ctx.shadowColor = "rgba(255,255,255,0.9)";
  ctx.shadowBlur = 16;
  ctx.font = "900 92px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  material.userData.texture = texture;
  return material;
}

function makeRecipeDisplayMaterial(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 420;
  canvas.height = 760;
  const ctx = canvas.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(26, 26, 368, 708);
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(68, 70, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 50px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("RECIPE", 104, 86);
  ctx.fillStyle = "#8be0b8";
  ctx.font = "900 48px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("단백질", 48, 178);
  ctx.fillText("쉐이크", 48, 240);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "800 32px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("우유 200ml", 52, 344);
  ctx.fillText("바나나 1개", 52, 402);
  ctx.fillText("프로틴 1스쿱", 52, 460);
  ctx.fillStyle = "rgba(79,140,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(50, 606, 320, 78, 22);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 32px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("지금 만들기", 210, 652);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture });
  material.userData.texture = texture;
  return material;
}

function extractHumidityText(scenario) {
  const weather = scenario.data.find((item) => item.id === "weather")?.value || "";
  const match = weather.match(/(\d{2})%/);
  return match ? `${match[1]}%` : "48%";
}

function createMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.02,
    transparent: options.transparent,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function addBox(group, { size, position, rotation = [0, 0, 0], material, castShadow = true, receiveShadow = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  group.add(mesh);
  return mesh;
}

function addCylinder(group, { radiusTop, radiusBottom, height, position, rotation = [0, 0, 0], material, segments = 32 }) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addStatusLight(group, { position, color, active, size = [0.09, 0.03, 0.02] }) {
  addBox(group, {
    size,
    position,
    material: createMaterial(active ? color : 0xc7ced6, {
      emissive: active ? color : 0x000000,
      emissiveIntensity: active ? 1.1 : 0,
    }),
    castShadow: false,
  });
}

function addSignal(group, { position, color, scale = 1 }) {
  const signal = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12 * scale, 0),
    createMaterial(color, {
      emissive: color,
      emissiveIntensity: 0.5,
      metalness: 0.08,
      roughness: 0.22,
    }),
  );
  crystal.scale.set(0.72, 1.24, 0.72);
  signal.add(crystal);

  const glow = new THREE.PointLight(color, 0.85 * scale, 1.4 * scale);
  glow.position.set(0, 0, 0.12);
  signal.add(glow);

  signal.position.set(...position);
  group.add(signal);
  return signal;
}

function addPlant(group, x, z, scale = 1) {
  const pot = createMaterial(0xf7faf5);
  const soil = createMaterial(0x5a3f2b);
  const leaf = createMaterial(0x2f7d4f, { roughness: 0.58 });

  addCylinder(group, {
    radiusTop: 0.13 * scale,
    radiusBottom: 0.16 * scale,
    height: 0.28 * scale,
    position: [x, 0.14 * scale, z],
    material: pot,
  });
  addCylinder(group, {
    radiusTop: 0.115 * scale,
    radiusBottom: 0.115 * scale,
    height: 0.025 * scale,
    position: [x, 0.3 * scale, z],
    material: soil,
  });

  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const leafMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 16, 10), leaf);
    leafMesh.scale.set(0.42, 0.13, 1.05);
    leafMesh.position.set(
      x + Math.cos(angle) * 0.12 * scale,
      0.5 * scale + (i % 3) * 0.06 * scale,
      z + Math.sin(angle) * 0.12 * scale,
    );
    leafMesh.rotation.set(0.45, angle, 0.2);
    leafMesh.castShadow = true;
    group.add(leafMesh);
  }
}

function addWindow(group, x, y, z, axis = "x") {
  const pane = createMaterial(0xfff8d7, {
    transparent: true,
    opacity: 0.58,
    emissive: 0xffd55e,
    emissiveIntensity: 0.18,
  });
  const frame = createMaterial(0xf6f0df);
  const curtain = createMaterial(0xb49b7d, { roughness: 0.88 });
  const rotation = axis === "x" ? [0, 0, 0] : [0, Math.PI / 2, 0];

  addBox(group, { size: [1.28, 0.08, 0.06], position: [x, y + 0.55, z], rotation, material: frame });
  addBox(group, { size: [1.28, 0.08, 0.06], position: [x, y - 0.55, z], rotation, material: frame });
  addBox(group, { size: [0.08, 1.18, 0.06], position: [x - 0.62, y, z], rotation, material: frame });
  addBox(group, { size: [0.08, 1.18, 0.06], position: [x + 0.62, y, z], rotation, material: frame });
  addBox(group, { size: [1.1, 0.94, 0.025], position: [x, y, z], rotation, material: pane, castShadow: false });
  addBox(group, { size: [0.04, 0.94, 0.07], position: [x, y, z + 0.01], rotation, material: frame });
  addBox(group, { size: [1.08, 0.04, 0.07], position: [x, y, z + 0.012], rotation, material: frame });
  addBox(group, { size: [0.14, 1.33, 0.09], position: [x - 0.82, y - 0.05, z + 0.03], rotation, material: curtain });
  addBox(group, { size: [0.14, 1.33, 0.09], position: [x + 0.82, y - 0.05, z + 0.03], rotation, material: curtain });
}

function addSofa(group, x, z, rotationY = 0) {
  const sofa = new THREE.Group();
  const fabric = createMaterial(0xd8c7ad);
  const darkFabric = createMaterial(0x8f765e);
  addBox(sofa, { size: [1.45, 0.28, 0.7], position: [0, 0.27, 0], material: fabric });
  addBox(sofa, { size: [1.5, 0.72, 0.22], position: [0, 0.62, -0.34], material: fabric });
  addBox(sofa, { size: [0.16, 0.46, 0.74], position: [-0.82, 0.47, 0], material: fabric });
  addBox(sofa, { size: [0.16, 0.46, 0.74], position: [0.82, 0.47, 0], material: fabric });
  addBox(sofa, { size: [0.34, 0.22, 0.12], position: [-0.34, 0.55, -0.19], material: darkFabric });
  addBox(sofa, { size: [0.34, 0.22, 0.12], position: [0.34, 0.55, -0.19], material: darkFabric });
  sofa.position.set(x, 0, z);
  sofa.rotation.y = rotationY;
  group.add(sofa);
}

function addRoomModel(scene, scenario) {
  const root = new THREE.Group();
  const deviceByName = Object.fromEntries(scenario.devices.map((device) => [device.name, device]));
  const statusOf = (name) => deviceByName[name]?.status || "idle";
  const isDeviceOn = (name) => statusOf(name) === "active" || statusOf(name) === "ready";
  const wall = createMaterial(0xf8f6ef);
  const brick = createMaterial(0xe7dfd2);
  const wood = createMaterial(0xc79b62, { roughness: 0.64 });
  const woodDark = createMaterial(0xa8763f);
  const rug = createMaterial(0xcfc4b5);
  const kitchenZone = createMaterial(0xe8eee8);
  const laundryZone = createMaterial(0xd9e4ea);
  const entryZone = createMaterial(0xd7ccb8);
  const white = createMaterial(0xfffdf7);
  const black = createMaterial(0x151515, { roughness: 0.36, metalness: 0.06 });
  const gold = createMaterial(0xb88a3b, { metalness: 0.18 });
  const silver = createMaterial(0xd8dfe5, { roughness: 0.42, metalness: 0.12 });
  const tvOn = isDeviceOn("TV");
  const tvStatus = statusOf("TV");
  const tvScreen = tvOn
    ? makeDisplayMaterial(tvStatus === "active" ? "BLOCK" : "DRAMA", tvStatus === "active" ? "자동 실행 차단" : "이어보기 준비", getStatusColor(tvStatus))
    : black;
  const acStatus = statusOf("선풍기");
  const acOn = isDeviceOn("선풍기");
  const humidityText = extractHumidityText(scenario);
  const stylerOn = isDeviceOn("스타일러");
  const fridgeOn = isDeviceOn("냉장고 화면");
  const speakerStatus = statusOf("스피커");
  const speakerOn = isDeviceOn("스피커");
  const dehumidifierOn = isDeviceOn("제습기");
  const waterPurifierOn = isDeviceOn("정수기");
  const inductionOn = isDeviceOn("인덕션");
  const dishwasherOn = isDeviceOn("식기세척기");
  const washerTowerOn = isDeviceOn("워시타워");
  const fridgeScreen = fridgeOn
    ? makeRecipeDisplayMaterial(getStatusColor(statusOf("냉장고 화면")))
    : createMaterial(0x8fb6d9, { emissive: 0x8fb6d9, emissiveIntensity: 0.15 });
  const acScreen = makeDisplayMaterial(acOn ? "24C" : "--C", `HUM ${humidityText}`, getStatusColor(acStatus));
  const speakerSignal = makeIconMaterial("♪ ♫", getStatusColor(speakerStatus), { width: 260, height: 180 });

  addBox(root, { size: [6.2, 0.16, 4.6], position: [0, -0.08, 0], material: wood, receiveShadow: true });
  for (let i = 0; i < 16; i += 1) {
    addBox(root, {
      size: [6.08, 0.018, 0.018],
      position: [0, 0.015, -2.18 + i * 0.29],
      material: woodDark,
      castShadow: false,
    });
  }
  for (let i = 0; i < 11; i += 1) {
    addBox(root, {
      size: [0.018, 0.02, 4.38],
      position: [-3 + i * 0.6, 0.02, 0],
      material: woodDark,
      castShadow: false,
    });
  }

  addBox(root, { size: [1.7, 0.025, 1.1], position: [-1.55, 0.025, 0.1], material: kitchenZone, castShadow: false });
  addBox(root, { size: [1.25, 0.025, 1.55], position: [-2.45, 0.026, 1.45], material: laundryZone, castShadow: false });
  addBox(root, { size: [1.15, 0.025, 0.76], position: [1.85, 0.027, 1.18], material: entryZone, castShadow: false });
  addBox(root, { size: [0.035, 0.08, 1.25], position: [-0.68, 0.075, 0.05], material: createMaterial(0xf7faf5), castShadow: false });
  addBox(root, { size: [1.16, 0.08, 0.035], position: [-2.46, 0.075, 0.68], material: createMaterial(0xf7faf5), castShadow: false });

  addBox(root, { size: [6.2, 2.65, 0.16], position: [0, 1.26, -2.38], material: wall });
  addBox(root, { size: [0.16, 2.65, 4.6], position: [-3.18, 1.26, 0], material: brick });
  addBox(root, { size: [4.2, 0.08, 0.18], position: [-0.8, 2.64, -2.38], material: wall });

  addWindow(root, -1.75, 1.38, -2.48, "x");
  addWindow(root, 0.95, 1.38, -2.48, "x");

  addBox(root, { size: [1.9, 0.04, 1.12], position: [0, 0.035, 0.58], material: rug, castShadow: false });
  addSofa(root, 0, 1.02, Math.PI);
  addBox(root, { size: [0.82, 0.18, 0.5], position: [0.18, 0.28, 0.22], material: white });
  addBox(root, { size: [0.3, 0.46, 0.3], position: [0.72, 0.24, 0.38], material: white });
  addCylinder(root, { radiusTop: 0.32, radiusBottom: 0.32, height: 0.08, position: [0.98, 0.48, 0.5], material: white });
  addCylinder(root, { radiusTop: 0.035, radiusBottom: 0.035, height: 0.5, position: [0.98, 0.25, 0.5], material: gold });
  addCylinder(root, { radiusTop: 0.2, radiusBottom: 0.2, height: 0.06, position: [0.98, 0.03, 0.5], material: gold });

  addBox(root, { size: [1.38, 0.52, 0.48], position: [-1.66, 0.26, 0.12], material: white });
  addBox(root, { size: [0.62, 0.06, 0.34], position: [-1.98, 0.55, 0.12], material: createMaterial(0x151515, { roughness: 0.32 }) });
  if (inductionOn) {
    addStatusLight(root, { position: [-1.98, 0.6, 0.12], color: getStatusColor(statusOf("인덕션")), active: true, size: [0.22, 0.018, 0.12] });
  }
  addBox(root, { size: [0.46, 0.36, 0.08], position: [-1.35, 0.28, 0.39], material: createMaterial(0xe6edf0) });
  addStatusLight(root, { position: [-1.35, 0.44, 0.44], color: getStatusColor(statusOf("식기세척기")), active: dishwasherOn, size: [0.16, 0.025, 0.02] });
  addBox(root, { size: [0.22, 0.62, 0.22], position: [-1.1, 0.33, -0.18], material: createMaterial(0xf4f7f5) });
  addCylinder(root, { radiusTop: 0.07, radiusBottom: 0.08, height: 0.12, position: [-1.1, 0.7, -0.18], material: silver });
  addStatusLight(root, { position: [-1.1, 0.55, -0.06], color: getStatusColor(statusOf("정수기")), active: waterPurifierOn, size: [0.09, 0.025, 0.02] });

  addBox(root, { size: [1.78, 0.08, 0.38], position: [0, 0.34, -1.96], material: white });
  addBox(root, { size: [1.42, 0.94, 0.08], position: [0, 1.32, -2.28], rotation: [0, 0, 0], material: tvScreen });
  if (tvOn) {
    addSignal(root, {
      position: [0, 2.18, -1.9],
      color: getStatusColor(tvStatus),
      scale: 1.08,
    });
  }
  if (tvOn) {
    const tvLight = new THREE.PointLight(getStatusColor(tvStatus), 1.4, 2.2);
    tvLight.position.set(0, 1.28, -1.74);
    root.add(tvLight);
  }
  addBox(root, { size: [0.08, 2.0, 0.09], position: [-0.62, 1.0, -2.28], material: gold });
  addBox(root, { size: [0.08, 2.0, 0.09], position: [0.62, 1.0, -2.28], material: gold });

  addBox(root, { size: [0.78, 0.22, 0.24], position: [-1.36, 2.04, -2.08], material: silver });
  addBox(root, {
    size: [0.98, 0.28, 0.02],
    position: [-1.36, 1.98, -1.9],
    material: acScreen,
    castShadow: false,
  });
  if (acOn) {
    addSignal(root, {
      position: [-1.36, 2.42, -1.92],
      color: getStatusColor(acStatus),
      scale: 0.86,
    });
  }
  addCylinder(root, { radiusTop: 0.2, radiusBottom: 0.2, height: 0.05, position: [1.36, 0.06, 0.92], material: silver, segments: 32 });
  addCylinder(root, { radiusTop: 0.035, radiusBottom: 0.035, height: 0.66, position: [1.36, 0.39, 0.92], material: silver, segments: 24 });
  addCylinder(root, {
    radiusTop: 0.26,
    radiusBottom: 0.26,
    height: 0.08,
    position: [1.36, 0.78, 0.92],
    rotation: [Math.PI / 2, 0, 0],
    material: createMaterial(acOn ? 0xdaf6ff : 0xe8edf0, {
      transparent: true,
      opacity: 0.72,
      emissive: acOn ? 0x8bdcff : 0x000000,
      emissiveIntensity: acOn ? 0.24 : 0,
    }),
    segments: 36,
  });
  for (let blade = 0; blade < 3; blade += 1) {
    const fanBlade = addBox(root, {
      size: [0.09, 0.018, 0.36],
      position: [1.36, 0.78, 0.92],
      rotation: [0, (blade * Math.PI * 2) / 3, 0.35],
      material: createMaterial(acOn ? 0x9ed8ff : 0xc5d0d8, { transparent: true, opacity: 0.64 }),
      castShadow: false,
    });
    fanBlade.scale.z = acOn ? 1.08 : 0.9;
  }

  addPlant(root, -0.68, -1.65, 0.72);
  addPlant(root, 2.18, -1.18, 0.86);
  addPlant(root, -0.92, 2.1, 0.48);

  addBox(root, { size: [0.88, 1.62, 0.44], position: [-2.15, 0.81, 1.29], material: createMaterial(0x1f2328, { roughness: 0.36 }) });
  addBox(root, { size: [0.62, 1.5, 0.05], position: [-2.06, 0.86, 1.54], material: createMaterial(0xe9e1d3, { roughness: 0.42 }) });
  addBox(root, { size: [0.14, 1.5, 0.055], position: [-2.47, 0.86, 1.55], material: createMaterial(0x15191f, { roughness: 0.32 }) });
  addBox(root, { size: [0.74, 0.035, 0.08], position: [-2.13, 1.63, 1.56], material: createMaterial(0x111318), castShadow: false });
  addBox(root, { size: [0.78, 0.06, 0.14], position: [-2.13, 0.03, 1.5], material: createMaterial(0x111318) });
  addCylinder(root, { radiusTop: 0.03, radiusBottom: 0.03, height: 0.008, position: [-2.49, 1.45, 1.58], rotation: [Math.PI / 2, 0, 0], material: createMaterial(0xf7faf5), segments: 20 });
  addBox(root, { size: [0.055, 0.012, 0.01], position: [-2.49, 1.02, 1.59], material: createMaterial(0xf7faf5), castShadow: false });
  addBox(root, { size: [0.055, 0.012, 0.01], position: [-2.49, 0.94, 1.59], material: createMaterial(0xf7faf5), castShadow: false });
  addBox(root, { size: [0.055, 0.012, 0.01], position: [-2.49, 0.86, 1.59], material: createMaterial(0xf7faf5), castShadow: false });
  if (stylerOn) addStatusLight(root, { position: [-2.49, 0.76, 1.59], color: getStatusColor(statusOf("스타일러")), active: statusOf("스타일러") === "active", size: [0.07, 0.02, 0.01] });
  if (stylerOn) {
    addSignal(root, {
      position: [-2.15, 2.18, 1.33],
      color: getStatusColor(statusOf("스타일러")),
      scale: 0.92,
    });
  }
  addBox(root, { size: [0.58, 1.18, 0.36], position: [-2.05, 0.59, 1.82], material: createMaterial(0xf1f5f8) });
  addCylinder(root, { radiusTop: 0.18, radiusBottom: 0.18, height: 0.025, position: [-2.05, 0.93, 2.01], rotation: [Math.PI / 2, 0, 0], material: createMaterial(0xcbd5dd), segments: 36 });
  addCylinder(root, { radiusTop: 0.18, radiusBottom: 0.18, height: 0.025, position: [-2.05, 0.35, 2.01], rotation: [Math.PI / 2, 0, 0], material: createMaterial(0xcbd5dd), segments: 36 });
  addStatusLight(root, { position: [-1.78, 1.1, 2.02], color: getStatusColor(statusOf("워시타워")), active: washerTowerOn, size: [0.09, 0.025, 0.02] });
  addBox(root, { size: [0.52, 1.68, 0.5], position: [-2.38, 0.84, -1.48], material: createMaterial(0xe5e7eb) });
  addBox(root, { size: [0.52, 1.68, 0.5], position: [-1.84, 0.84, -1.48], material: createMaterial(0xf0f3f6) });
  addBox(root, { size: [0.03, 1.62, 0.52], position: [-2.11, 0.84, -1.48], material: createMaterial(0xc6d0d8), castShadow: false });
  addBox(root, { size: [0.03, 1.04, 0.055], position: [-1.98, 0.82, -1.2], material: silver, castShadow: false });
  addBox(root, { size: [0.03, 1.04, 0.055], position: [-2.24, 0.82, -1.2], material: silver, castShadow: false });
  addBox(root, {
    size: [0.34, 0.92, 0.035],
    position: [-1.82, 1.02, -1.19],
    material: fridgeScreen,
    castShadow: false,
  });
  if (fridgeOn) {
    addSignal(root, {
      position: [-1.82, 2.28, -1.3],
      color: getStatusColor(statusOf("냉장고 화면")),
      scale: 1,
    });
  }

  const airStatus = statusOf("공기청정기");
  const airOn = isDeviceOn("공기청정기");
  addCylinder(root, {
    radiusTop: 0.23,
    radiusBottom: 0.26,
    height: 0.86,
    position: [1.34, 0.43, -1.98],
    material: createMaterial(0xf1f5f2),
    segments: 36,
  });
  addStatusLight(root, { position: [1.34, 0.86, -1.77], color: getStatusColor(airStatus), active: airOn, size: [0.13, 0.04, 0.02] });
  addCylinder(root, {
    radiusTop: 0.17,
    radiusBottom: 0.2,
    height: 0.62,
    position: [1.76, 0.31, -1.94],
    material: createMaterial(0xe9eef1),
    segments: 36,
  });
  addStatusLight(root, { position: [1.76, 0.63, -1.76], color: getStatusColor(statusOf("제습기")), active: dehumidifierOn, size: [0.1, 0.03, 0.02] });

  addCylinder(root, {
    radiusTop: 0.24,
    radiusBottom: 0.32,
    height: 0.58,
    position: [2.28, 0.29, 0.46],
    material: createMaterial(0xd9cdbb, { roughness: 0.88 }),
    segments: 48,
  });
  addCylinder(root, {
    radiusTop: 0.24,
    radiusBottom: 0.2,
    height: 0.12,
    position: [2.28, 0.63, 0.46],
    material: createMaterial(0xbab6ad, { roughness: 0.34, metalness: 0.12 }),
    segments: 48,
  });
  addBox(root, {
    size: [0.22, 0.3, 0.08],
    position: [2.45, 0.75, 0.46],
    rotation: [0, 0, -0.18],
    material: createMaterial(0xd6d0c4),
  });
  addCylinder(root, {
    radiusTop: 0.2,
    radiusBottom: 0.12,
    height: 0.12,
    position: [2.28, 0.77, 0.46],
    material: createMaterial(speakerOn ? 0xffe9a6 : 0xbeb8aa, {
      transparent: true,
      opacity: 0.86,
      emissive: speakerOn ? 0xffd55e : 0x000000,
      emissiveIntensity: speakerOn ? 0.55 : 0,
    }),
    segments: 4,
  });
  addStatusLight(root, {
    position: [2.28, 0.52, 0.76],
    color: getStatusColor(speakerStatus),
    active: speakerOn,
    size: [0.11, 0.03, 0.02],
  });
  if (speakerOn) {
    addSignal(root, {
      position: [2.18, 1.5, 0.62],
      color: getStatusColor(speakerStatus),
      scale: 0.78,
    });
    addBox(root, {
      size: [0.52, 0.36, 0.02],
      position: [2.12, 1.24, 0.64],
      rotation: [0, -0.28, 0],
      material: speakerSignal,
      castShadow: false,
      receiveShadow: false,
    });
  }

  const robotOn = isDeviceOn("로봇청소기");
  addCylinder(root, { radiusTop: 0.34, radiusBottom: 0.34, height: 0.16, position: [0.34, 0.08, 1.58], material: createMaterial(0x20242a, { roughness: 0.32 }), segments: 56 });
  addCylinder(root, { radiusTop: 0.13, radiusBottom: 0.13, height: 0.03, position: [0.34, 0.18, 1.58], material: createMaterial(0x0f172a), segments: 40 });
  addBox(root, { size: [0.24, 0.035, 0.025], position: [0.34, 0.19, 1.24], material: createMaterial(robotOn ? 0xff7557 : 0x9aa6b2, { emissive: robotOn ? 0xff7557 : 0x000000, emissiveIntensity: robotOn ? 0.7 : 0 }), castShadow: false });
  if (robotOn) {
    addCylinder(root, {
      radiusTop: 0.46,
      radiusBottom: 0.46,
      height: 0.012,
      position: [0.34, 0.032, 1.58],
      material: createMaterial(0x78e6b0, { transparent: true, opacity: 0.26, emissive: 0x16a36d, emissiveIntensity: 0.28 }),
      segments: 56,
    });
    addStatusLight(root, { position: [0.34, 0.21, 1.58], color: getStatusColor(statusOf("로봇청소기")), active: true, size: [0.14, 0.025, 0.07] });
  }

  const lightOn = isDeviceOn("조명");
  addCylinder(root, {
    radiusTop: 0.24,
    radiusBottom: 0.12,
    height: 0.2,
    position: [-0.2, 2.36, -1.55],
    material: createMaterial(lightOn ? 0xfff1aa : 0xf1ead6, { emissive: lightOn ? 0xffd55e : 0x000000, emissiveIntensity: lightOn ? 0.55 : 0 }),
    segments: 32,
  });
  if (lightOn) {
    addBox(root, {
      size: [2.25, 0.02, 1.1],
      position: [-0.18, 0.035, -1.25],
      material: createMaterial(0xffedaa, { transparent: true, opacity: 0.34, emissive: 0xffd55e, emissiveIntensity: 0.36 }),
      castShadow: false,
      receiveShadow: false,
    });
    addBox(root, {
      size: [1.72, 0.72, 0.018],
      position: [-0.2, 1.42, -2.28],
      material: createMaterial(0xffedaa, { transparent: true, opacity: 0.26, emissive: 0xffd55e, emissiveIntensity: 0.28 }),
      castShadow: false,
      receiveShadow: false,
    });
    const lamp = new THREE.PointLight(0xffd55e, 2.8, 3.4);
    lamp.position.set(-0.2, 2.1, -1.2);
    root.add(lamp);
  }

  root.rotation.y = -0.14;
  scene.add(root);
  return { root };
}

function disposeObject(object) {
  object.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.userData?.texture?.dispose?.();
        material.map?.dispose?.();
        material.dispose();
      });
    }
  });
}

export default function IsometricHomeScene({ scenario }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f8f0);

    const camera = new THREE.OrthographicCamera(-4.8, 4.8, 3.2, -3.2, 0.1, 100);
    camera.position.set(4.55, 4.15, 5.45);
    camera.lookAt(0.02, 0.9, -0.92);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch (error) {
      const fallback = document.createElement("div");
      fallback.className = "webgl-fallback";
      fallback.innerHTML = `
        <strong>3D 시뮬레이션을 준비할 수 없습니다.</strong>
        <span>브라우저의 WebGL 또는 하드웨어 가속 설정을 확인해 주세요.</span>
      `;
      mount.appendChild(fallback);
      return () => {
        mount.removeChild(fallback);
      };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "isometric-home-canvas";
    renderer.domElement.style.cursor = "grab";
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xd6c4a4, 2.1);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 3.1);
    sun.position.set(-2.5, 5.2, 3.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffe3bd, 1.2);
    fill.position.set(4, 2.2, -2);
    scene.add(fill);

    const room = addRoomModel(scene, scenario);
    const interaction = {
      dragging: false,
      pointerX: 0,
      pointerY: 0,
      targetRotationY: -0.14,
      currentRotationY: -0.14,
      targetRotationX: 0,
      currentRotationX: 0,
      zoom: 5.25,
    };
    let frameId = 0;

    function resize() {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight, false);
      const aspect = clientWidth / Math.max(clientHeight, 1);
      const viewHeight = interaction.zoom;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.updateProjectionMatrix();
    }

    function handlePointerDown(event) {
      interaction.dragging = true;
      interaction.pointerX = event.clientX;
      interaction.pointerY = event.clientY;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    }

    function handlePointerMove(event) {
      if (!interaction.dragging) return;
      const dx = event.clientX - interaction.pointerX;
      const dy = event.clientY - interaction.pointerY;
      interaction.pointerX = event.clientX;
      interaction.pointerY = event.clientY;
      interaction.targetRotationY += dx * 0.008;
      interaction.targetRotationX = THREE.MathUtils.clamp(
        interaction.targetRotationX + dy * 0.004,
        -0.32,
        0.22,
      );
    }

    function handlePointerUp(event) {
      interaction.dragging = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = "grab";
    }

    function handleWheel(event) {
      event.preventDefault();
      interaction.zoom = THREE.MathUtils.clamp(interaction.zoom + event.deltaY * 0.003, 4.15, 6.4);
      resize();
    }

    function animate() {
      interaction.currentRotationY += (interaction.targetRotationY - interaction.currentRotationY) * 0.12;
      interaction.currentRotationX += (interaction.targetRotationX - interaction.currentRotationX) * 0.12;
      room.root.rotation.y = interaction.currentRotationY;
      room.root.rotation.x = interaction.currentRotationX;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();
    window.addEventListener("resize", resize);
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      window.cancelAnimationFrame(frameId);
      disposeObject(room.root);
      scene.clear();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [scenario]);

  return <div className="isometric-home-scene" ref={mountRef} aria-label="3D 집 가상 시뮬레이션" />;
}
