import * as THREE from "three";

function makeMesh(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  return mesh;
}

function makeCapsule(material, position, scale, rotation = [0, 0, 0]) {
  return makeMesh(
    new THREE.CapsuleGeometry(0.08, 0.32, 12, 24),
    material,
    position,
    scale,
    rotation
  );
}

function createEar(material, innerMaterial, side) {
  const ear = new THREE.Group();
  ear.position.set(side * 0.43, 1.53, 0.08);
  ear.rotation.set(0.12, side * 0.08, side * -0.5);

  const outer = makeMesh(
    new THREE.SphereGeometry(0.21, 36, 36),
    material,
    [0, -0.08, 0],
    [0.6, 1.22, 0.36],
    [0, 0, side * 0.16]
  );
  const inner = makeMesh(
    new THREE.SphereGeometry(0.13, 32, 32),
    innerMaterial,
    [side * 0.015, -0.1, 0.055],
    [0.55, 1.02, 0.16],
    [0, 0, side * 0.12]
  );

  ear.add(outer, inner);
  return ear;
}

function createTail(material) {
  const tail = new THREE.Group();
  tail.position.set(0.54, 0.82, -0.22);
  tail.rotation.set(0.1, -0.4, -0.55);

  const base = makeCapsule(material, [0, 0, 0], [0.9, 1.05, 0.9], [0.15, 0, -0.25]);
  const tip = makeMesh(new THREE.SphereGeometry(0.12, 32, 32), material, [0.16, 0.25, 0], [1.0, 1.0, 0.82]);
  tail.add(base, tip);
  return tail;
}

export function createFallbackMascot(scene) {
  const group = new THREE.Group();
  group.name = "MomoPet";

  const furMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfffbf1,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.36,
    clearcoatRoughness: 0.34,
  });

  const faceMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.0,
    clearcoat: 0.28,
  });

  const earMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd8a977,
    roughness: 0.5,
    metalness: 0.0,
    clearcoat: 0.18,
  });

  const innerEarMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc5d2,
    roughness: 0.62,
  });

  const inkMaterial = new THREE.MeshStandardMaterial({
    color: 0x141820,
    roughness: 0.48,
  });

  const blushMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8fb0,
    roughness: 0.58,
  });

  const collarMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x42c7b7,
    roughness: 0.34,
    metalness: 0.05,
    clearcoat: 0.3,
  });

  const bellMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffcd61,
    roughness: 0.24,
    metalness: 0.22,
    clearcoat: 0.32,
  });

  const body = makeMesh(
    new THREE.SphereGeometry(0.68, 64, 64),
    furMaterial,
    [0, 0.9, 0],
    [0.86, 1.14, 0.76]
  );
  group.add(body);

  const head = makeMesh(
    new THREE.SphereGeometry(0.52, 64, 64),
    furMaterial,
    [0, 1.28, 0.2],
    [1.05, 0.9, 0.86]
  );
  group.add(head);

  const facePatch = makeMesh(
    new THREE.SphereGeometry(0.42, 48, 48),
    faceMaterial,
    [0, 1.17, 0.58],
    [1.08, 0.72, 0.28]
  );
  group.add(facePatch);

  const muzzle = makeMesh(
    new THREE.SphereGeometry(0.18, 32, 32),
    faceMaterial,
    [0, 1.08, 0.76],
    [1.18, 0.58, 0.34]
  );
  group.add(muzzle);

  const leftEar = createEar(earMaterial, innerEarMaterial, -1);
  const rightEar = createEar(earMaterial, innerEarMaterial, 1);
  group.add(leftEar, rightEar);

  const leftEye = makeMesh(new THREE.SphereGeometry(0.052, 24, 24), inkMaterial, [-0.17, 1.23, 0.72]);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.17;
  group.add(leftEye, rightEye);

  const leftSparkle = makeMesh(
    new THREE.SphereGeometry(0.014, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    [-0.185, 1.245, 0.76]
  );
  const rightSparkle = leftSparkle.clone();
  rightSparkle.position.x = 0.155;
  group.add(leftSparkle, rightSparkle);

  const nose = makeMesh(
    new THREE.SphereGeometry(0.055, 24, 24),
    inkMaterial,
    [0, 1.11, 0.86],
    [1.12, 0.78, 0.5]
  );
  group.add(nose);

  const mouth = makeMesh(
    new THREE.SphereGeometry(0.043, 24, 24),
    inkMaterial,
    [0, 1.02, 0.85],
    [1.35, 0.32, 0.22]
  );
  group.add(mouth);

  const leftCheek = makeMesh(
    new THREE.SphereGeometry(0.058, 24, 24),
    blushMaterial,
    [-0.32, 1.08, 0.72],
    [1.55, 0.55, 0.22]
  );
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = 0.32;
  group.add(leftCheek, rightCheek);

  const collar = new THREE.Group();
  collar.position.set(0, 0.79, 0.48);
  collar.add(makeCapsule(collarMaterial, [-0.17, 0, 0], [1.0, 0.35, 0.4], [0, 0, Math.PI / 2]));
  collar.add(makeCapsule(collarMaterial, [0.17, 0, 0], [1.0, 0.35, 0.4], [0, 0, Math.PI / 2]));
  const bell = makeMesh(new THREE.SphereGeometry(0.075, 24, 24), bellMaterial, [0, -0.07, 0.08], [1, 0.95, 0.8]);
  collar.add(bell);
  group.add(collar);

  const leftPaw = makeCapsule(earMaterial, [-0.48, 0.86, 0.43], [0.88, 1.18, 0.9], [0.25, 0.05, 0.52]);
  const rightPaw = makeCapsule(earMaterial, [0.48, 0.86, 0.43], [0.88, 1.18, 0.9], [0.25, -0.05, -0.52]);
  group.add(leftPaw, rightPaw);

  const leftFoot = makeCapsule(earMaterial, [-0.22, 0.25, 0.22], [1.16, 0.55, 0.84], [0, 0.1, Math.PI / 2]);
  const rightFoot = makeCapsule(earMaterial, [0.22, 0.25, 0.22], [1.16, 0.55, 0.84], [0, -0.1, Math.PI / 2]);
  group.add(leftFoot, rightFoot);

  const tail = createTail(earMaterial);
  group.add(tail);

  group.userData.parts = {
    body,
    head,
    facePatch,
    muzzle,
    leftEar,
    rightEar,
    leftEye,
    rightEye,
    nose,
    mouth,
    leftCheek,
    rightCheek,
    collar,
    bell,
    leftPaw,
    rightPaw,
    leftFoot,
    rightFoot,
    tail,
  };

  scene.add(group);
  return group;
}

export function updateFallbackMascot(group, emotion, action, speaking, elapsed) {
  if (!group?.userData?.parts) return;

  const {
    body,
    head,
    facePatch,
    muzzle,
    leftEar,
    rightEar,
    leftEye,
    rightEye,
    nose,
    mouth,
    leftCheek,
    rightCheek,
    collar,
    bell,
    leftPaw,
    rightPaw,
    leftFoot,
    rightFoot,
    tail,
  } = group.userData.parts;

  const bob = Math.sin(elapsed * 2) * 0.03;
  group.position.set(0, bob, 0);
  group.rotation.set(0, Math.sin(elapsed * 0.55) * 0.055, 0);

  body.rotation.set(0, 0, Math.sin(elapsed * 1.15) * 0.012);
  head.rotation.set(0, Math.sin(elapsed * 0.8) * 0.035, 0);
  facePatch.rotation.set(0, 0, 0);
  muzzle.rotation.set(0, 0, 0);
  collar.rotation.set(0, 0, 0);
  bell.position.y = -0.07 + Math.sin(elapsed * 3.2) * 0.008;
  leftEar.rotation.z = 0.5 + Math.sin(elapsed * 1.7) * 0.035;
  rightEar.rotation.z = -0.5 - Math.sin(elapsed * 1.7) * 0.035;
  leftPaw.rotation.set(0.25, 0.05, 0.52);
  rightPaw.rotation.set(0.25, -0.05, -0.52);
  leftFoot.rotation.z = Math.PI / 2;
  rightFoot.rotation.z = Math.PI / 2;
  tail.rotation.set(0.1, -0.4, -0.55 + Math.sin(elapsed * 3.6) * 0.11);
  leftEye.scale.set(1, 1, 1);
  rightEye.scale.set(1, 1, 1);
  nose.scale.set(1.12, 0.78, 0.5);
  mouth.scale.set(1.35, 0.32, 0.22);
  leftCheek.scale.set(1.55, 0.55, 0.22);
  rightCheek.scale.set(1.55, 0.55, 0.22);

  if (emotion === "happy" || emotion === "excited") {
    leftEye.scale.y = 0.42;
    rightEye.scale.y = 0.42;
    mouth.scale.set(1.55, 0.52, 0.25);
    body.rotation.z = Math.sin(elapsed * 5.6) * 0.035;
    head.rotation.z = Math.sin(elapsed * 5.6) * 0.025;
    leftCheek.scale.x = 1.78;
    rightCheek.scale.x = 1.78;
    tail.rotation.z = -0.55 + Math.sin(elapsed * 9.5) * 0.24;
  }

  if (emotion === "thinking") {
    head.rotation.z = 0.1;
    facePatch.rotation.z = 0.06;
    leftEye.scale.y = 0.8;
    rightEye.scale.y = 0.8;
    mouth.scale.set(0.7, 0.35, 0.2);
    leftEar.rotation.z = 0.58;
    rightEar.rotation.z = -0.38;
  }

  if (emotion === "concerned") {
    leftEye.scale.y = 0.62;
    rightEye.scale.y = 0.62;
    head.rotation.x = -0.035;
    mouth.scale.set(0.95, 0.22, 0.2);
    leftEar.rotation.z = 0.7;
    rightEar.rotation.z = -0.7;
    tail.rotation.z = -0.72;
  } else {
    head.rotation.x = 0;
  }

  if (emotion === "sleepy") {
    leftEye.scale.y = 0.16;
    rightEye.scale.y = 0.16;
    group.position.y -= 0.03;
    head.rotation.z = Math.sin(elapsed * 0.9) * 0.035;
    tail.rotation.z = -0.62 + Math.sin(elapsed * 1.5) * 0.04;
  }

  if (speaking) {
    const pulse = (Math.sin(elapsed * 18) + 1) / 2;
    mouth.scale.y = 0.28 + pulse * 0.55;
    nose.scale.set(1.12 + pulse * 0.08, 0.78 + pulse * 0.04, 0.5);
    bell.scale.setScalar(1 + Math.sin(elapsed * 12) * 0.035);
  } else {
    bell.scale.setScalar(1);
  }

  if (action === "nod") {
    head.rotation.x = Math.sin(elapsed * 8) * 0.12;
    muzzle.rotation.x = Math.sin(elapsed * 8) * 0.05;
  }

  if (action === "shake_head") {
    group.rotation.y = Math.sin(elapsed * 8) * 0.16;
    leftEar.rotation.z = 0.5 + Math.sin(elapsed * 8) * 0.08;
    rightEar.rotation.z = -0.5 - Math.sin(elapsed * 8) * 0.08;
  }

  if (action === "wave") {
    rightPaw.rotation.z = -1.12;
    rightPaw.rotation.x = 0.25 + Math.sin(elapsed * 10) * 0.58;
  }

  if (action === "explain") {
    rightPaw.rotation.z = -0.82 + Math.sin(elapsed * 3) * 0.16;
    leftPaw.rotation.z = 0.48 + Math.cos(elapsed * 2.5) * 0.1;
    head.rotation.y += Math.sin(elapsed * 2) * 0.04;
  }

  if (action === "thinking") {
    group.rotation.z = 0.035 + Math.sin(elapsed * 1.5) * 0.02;
    leftPaw.rotation.z = 0.72;
  }

  if (action === "celebrate") {
    leftPaw.rotation.z = 0.96;
    rightPaw.rotation.z = -0.96;
    group.position.y += Math.abs(Math.sin(elapsed * 7)) * 0.065;
    tail.rotation.z = -0.55 + Math.sin(elapsed * 12) * 0.34;
  }
}
