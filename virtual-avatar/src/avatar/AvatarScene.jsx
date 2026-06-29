import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadVRM } from "./loadVRM";
import { loadGLB } from "./loadGLB";
import { applyEmotion } from "./emotionController";
import { applyMotion } from "./motionController";
import { createFallbackMascot, updateFallbackMascot } from "./fallbackMascot";
import { sampleAudioLevel, audioGraphReady } from "./audioLipSync";

function captureTransform(node) {
  if (!node) return null;
  return {
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    scale: node.scale.clone(),
  };
}

function resetTransform(node, base) {
  if (!node || !base) return;
  node.position.copy(base.position);
  node.rotation.copy(base.rotation);
  node.scale.copy(base.scale);
}

function scaleAroundGeometryCenter(node, base, factors) {
  if (!node || !base || !node.geometry) return;

  node.geometry.computeBoundingBox();
  const center = node.geometry.boundingBox?.getCenter(new THREE.Vector3());
  if (!center) return;

  node.scale.set(
    base.scale.x * factors.x,
    base.scale.y * factors.y,
    base.scale.z * factors.z
  );
  node.position.set(
    base.position.x + base.scale.x * center.x * (1 - factors.x),
    base.position.y + base.scale.y * center.y * (1 - factors.y),
    base.position.z + base.scale.z * center.z * (1 - factors.z)
  );
}

function createSunglasses(parts) {
  if (!parts.leftEye || !parts.rightEye) return null;

  const glasses = new THREE.Group();
  glasses.name = "BossBabySunglasses";

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x05070b,
    roughness: 0.2,
    metalness: 0.55,
  });
  const lensMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x121a24,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
  });
  const frameGeometry = new THREE.BoxGeometry(0.18, 0.105, 0.022);
  const lensGeometry = new THREE.BoxGeometry(0.145, 0.073, 0.025);

  const leftFrame = new THREE.Mesh(frameGeometry, frameMaterial);
  const rightFrame = new THREE.Mesh(frameGeometry, frameMaterial);
  const leftLens = new THREE.Mesh(lensGeometry, lensMaterial);
  const rightLens = new THREE.Mesh(lensGeometry, lensMaterial);
  const glassesZ = parts.leftEye.position.z + 0.045;
  leftFrame.position.set(parts.leftEye.position.x, parts.leftEye.position.y, glassesZ);
  rightFrame.position.set(parts.rightEye.position.x, parts.rightEye.position.y, glassesZ);
  leftLens.position.set(parts.leftEye.position.x, parts.leftEye.position.y, glassesZ + 0.014);
  rightLens.position.set(parts.rightEye.position.x, parts.rightEye.position.y, glassesZ + 0.014);
  leftFrame.rotation.z = 0.025;
  leftLens.rotation.z = 0.025;
  rightFrame.rotation.z = -0.025;
  rightLens.rotation.z = -0.025;

  const bridgeGeometry = new THREE.BoxGeometry(0.07, 0.018, 0.018);
  const bridge = new THREE.Mesh(bridgeGeometry, frameMaterial);
  bridge.position.set(
    (parts.leftEye.position.x + parts.rightEye.position.x) / 2,
    (parts.leftEye.position.y + parts.rightEye.position.y) / 2,
    glassesZ + 0.004
  );

  const armGeometry = new THREE.BoxGeometry(0.11, 0.015, 0.015);
  const leftArm = new THREE.Mesh(armGeometry, frameMaterial);
  const rightArm = new THREE.Mesh(armGeometry, frameMaterial);
  leftArm.position.set(parts.leftEye.position.x - 0.135, parts.leftEye.position.y + 0.012, glassesZ - 0.006);
  rightArm.position.set(parts.rightEye.position.x + 0.135, parts.rightEye.position.y + 0.012, glassesZ - 0.006);
  leftArm.rotation.z = -0.08;
  rightArm.rotation.z = 0.08;

  glasses.add(leftFrame, rightFrame, leftLens, rightLens, bridge, leftArm, rightArm);
  glasses.userData.disposables = [
    frameGeometry,
    lensGeometry,
    bridgeGeometry,
    armGeometry,
    frameMaterial,
    lensMaterial,
  ];
  return glasses;
}

function prepareGLBAvatar(model) {
  const byName = {};
  const mouthMeshes = [];
  const blinkMeshes = [];
  model.traverse((node) => {
    if (node.name) {
      byName[node.name] = node;
    }
    if (node.isMesh && node.morphTargetDictionary) {
      if ("MouthOpen" in node.morphTargetDictionary) mouthMeshes.push(node);
      if ("Blink" in node.morphTargetDictionary) blinkMeshes.push(node);
    }
  });

  // 모프 타깃(MouthOpen/Blink)으로 만든 캐릭터는 오디오 진폭 립싱크로 따로 구동한다.
  if (mouthMeshes.length || blinkMeshes.length) {
    const sunglasses = createSunglasses({ leftEye: byName.LeftEye, rightEye: byName.RightEye });
    if (sunglasses) {
      sunglasses.visible = false;
      model.add(sunglasses);
      model.userData.sunglasses = sunglasses;
    }
    model.userData.morphDriven = true;
    model.userData.morph = { mouthMeshes, blinkMeshes };
    model.userData.baseRotationY = 0.1;
    return;
  }

  const parts = {
    body: byName.Body,
    fuzzShell: byName.FuzzShell,
    upperBeak: byName.UpperBeak,
    lowerBeak: byName.LowerBeak,
    leftWing: byName.LeftWing,
    rightWing: byName.RightWing,
    leftEye: byName.LeftEye,
    rightEye: byName.RightEye,
    leftEyeSparkle: byName.LeftEyeSparkle,
    rightEyeSparkle: byName.RightEyeSparkle,
    nose: byName.Nose,
    mouth: byName.Mouth,
    leftCheek: byName.LeftCheek,
    rightCheek: byName.RightCheek,
    topFeatherLeft: byName.TopFeatherLeft,
    topFeatherMid: byName.TopFeatherMid,
    topFeatherRight: byName.TopFeatherRight,
  };

  const isChick = Boolean(parts.upperBeak && parts.lowerBeak);
  const faceMesh = byName.BodyFace;

  if (!isChick && faceMesh?.geometry && parts.leftEye && parts.rightEye) {
    faceMesh.geometry.computeBoundingBox();
    const faceCenterX = faceMesh.geometry.boundingBox?.getCenter(new THREE.Vector3()).x ?? 0;
    const eyeY = (parts.leftEye.position.y + parts.rightEye.position.y) / 2;

    parts.leftEye.position.set(faceCenterX - 0.115, eyeY, parts.leftEye.position.z);
    parts.rightEye.position.set(faceCenterX + 0.115, eyeY, parts.rightEye.position.z);

    if (parts.leftEyeSparkle) {
      parts.leftEyeSparkle.position.x = parts.leftEye.position.x - 0.015;
    }
    if (parts.rightEyeSparkle) {
      parts.rightEyeSparkle.position.x = parts.rightEye.position.x - 0.015;
    }
    if (parts.nose) {
      parts.nose.position.x = faceCenterX;
    }
    if (parts.mouth) {
      parts.mouth.position.x = faceCenterX;
    }
    if (parts.leftCheek && parts.rightCheek) {
      const cheekY = (parts.leftCheek.position.y + parts.rightCheek.position.y) / 2;
      parts.leftCheek.position.set(faceCenterX - 0.25, cheekY, parts.leftCheek.position.z);
      parts.rightCheek.position.set(faceCenterX + 0.25, cheekY, parts.rightCheek.position.z);
    }
  }

  if (isChick && parts.leftEye && parts.rightEye) {
    const faceCenterX = (parts.leftEye.position.x + parts.rightEye.position.x) / 2;
    parts.upperBeak.position.x = faceCenterX;
    parts.upperBeak.position.y = 0.735;
    parts.upperBeak.scale.x = 0.5;
    parts.upperBeak.scale.y = 0.52;
    parts.lowerBeak.position.x = faceCenterX;
    parts.lowerBeak.position.y = 0.702;
    parts.lowerBeak.scale.x = 0.36;
    parts.lowerBeak.scale.y = 0.43;
  }

  if (!isChick) {
    const sunglasses = createSunglasses(parts);
    if (sunglasses) {
      sunglasses.visible = false;
      model.add(sunglasses);
      model.userData.sunglasses = sunglasses;
    }
  }

  model.userData.parts = parts;
  model.userData.baseRotationY = isChick ? 0 : 0.1;
  model.userData.baseTransforms = Object.fromEntries(
    Object.entries(parts).map(([key, node]) => [key, captureTransform(node)])
  );
}

function updateMorphAvatar(model, emotion, action, speaking, elapsed, audioLevel, dt) {
  const { mouthMeshes, blinkMeshes } = model.userData.morph;

  const baseY = model.userData.baseY || 0;
  const baseRotationY = model.userData.baseRotationY || 0;

  // ---- 랜덤 시선/배회: 가만히 있을 땐 여기저기 둘러보고 좌우로 조금 움직이다가,
  //      말할 땐 정면으로 돌아온다 ----
  let targetYaw;
  let targetPitch;
  let targetX;
  if (speaking) {
    targetYaw = 0;
    targetPitch = 0;
    targetX = 0;
  } else {
    if (elapsed >= (model.userData.nextGazeAt ?? 0)) {
      model.userData.gazeTargetYaw = (Math.random() - 0.5) * 0.7; // 좌우 둘러보기
      model.userData.gazeTargetPitch = (Math.random() - 0.5) * 0.12; // 위/아래
      model.userData.wanderTargetX = (Math.random() - 0.5) * 0.24; // 좌우 배회
      model.userData.nextGazeAt = elapsed + 1.4 + Math.random() * 2.6;
    }
    targetYaw = model.userData.gazeTargetYaw ?? 0;
    targetPitch = model.userData.gazeTargetPitch ?? 0;
    targetX = model.userData.wanderTargetX ?? 0;
  }

  const ease = speaking ? 0.06 : 0.025; // 말할 땐 정면으로 더 빨리 복귀
  const yaw = (model.userData.gazeYaw ?? 0) + (targetYaw - (model.userData.gazeYaw ?? 0)) * ease;
  const pitch = (model.userData.gazePitch ?? 0) + (targetPitch - (model.userData.gazePitch ?? 0)) * ease;
  const driftX = (model.userData.wanderX ?? 0) + (targetX - (model.userData.wanderX ?? 0)) * ease;
  model.userData.gazeYaw = yaw;
  model.userData.gazePitch = pitch;
  model.userData.wanderX = driftX;

  model.position.x = driftX;
  model.position.y = baseY + Math.sin(elapsed * 2.0) * 0.02;
  model.rotation.y = baseRotationY + yaw + Math.sin(elapsed * 0.5) * 0.015;
  model.rotation.x = pitch;
  model.rotation.z = 0;
  if (emotion === "thinking" || action === "thinking") {
    model.rotation.z = 0.02 + Math.sin(elapsed * 1.5) * 0.015;
  }
  if (action === "shake_head") {
    model.rotation.y = baseRotationY + Math.sin(elapsed * 8) * 0.12;
  }

  // ---- 입(MouthOpen): 말할 때 오디오 진폭에 맞춰 연다 ----
  const GAIN = 2.4; // 진폭 -> 입 벌림 배율
  const MAX_OPEN = 0.9; // 너무 크게 벌어지지 않도록 상한
  let target = 0;
  if (speaking) {
    if (audioGraphReady()) {
      // 실제 음성 진폭으로 — 단어 사이 묵음에선 자연스럽게 입이 닫힌다.
      target = Math.min(MAX_OPEN, audioLevel * GAIN);
    } else {
      // 웹오디오 그래프가 없을 때(브라우저 TTS 등)는 옹알이 엔벨로프로 대체.
      const x = elapsed * 12;
      const v = Math.abs((Math.sin(x * 2.1) + Math.sin(x * 3.7) + Math.sin(x * 6.3)) / 3);
      const gate = Math.sin(x * 0.7) > -0.3 ? 1 : 0.08;
      target = Math.min(MAX_OPEN, v * gate);
    }
  }
  const cur = model.userData.mouthCur ?? 0;
  const next = cur + (target - cur) * (target > cur ? 0.6 : 0.25); // 떨림 방지 스무딩
  model.userData.mouthCur = next;
  for (const mesh of mouthMeshes) {
    const idx = mesh.morphTargetDictionary.MouthOpen;
    if (idx !== undefined) mesh.morphTargetInfluences[idx] = next;
  }

  // ---- 깜빡임(Blink) 스케줄러 ----
  let blinkVal = model.userData.blinkVal ?? 0;
  let phase = model.userData.blinkPhase || "open";
  let nextBlink = model.userData.nextBlink ?? elapsed + 2;
  const speed = 7; // 초당 진행 속도
  if (phase === "open" && elapsed >= nextBlink) phase = "closing";
  if (phase === "closing") {
    blinkVal += speed * dt;
    if (blinkVal >= 1) {
      blinkVal = 1;
      phase = "opening";
    }
  } else if (phase === "opening") {
    blinkVal -= speed * dt;
    if (blinkVal <= 0) {
      blinkVal = 0;
      phase = "open";
      nextBlink = elapsed + 2 + Math.random() * 4;
    }
  }
  model.userData.blinkVal = blinkVal;
  model.userData.blinkPhase = phase;
  model.userData.nextBlink = nextBlink;

  for (const mesh of blinkMeshes) {
    const idx = mesh.morphTargetDictionary.Blink;
    if (idx !== undefined) mesh.morphTargetInfluences[idx] = blinkVal;
  }
}

function updateGLBAvatar(model, emotion, action, speaking, elapsed, audioLevel, dt) {
  if (model.userData.morphDriven) {
    updateMorphAvatar(model, emotion, action, speaking, elapsed, audioLevel, dt);
    return;
  }

  const parts = model.userData.parts || {};
  const base = model.userData.baseTransforms || {};

  Object.entries(parts).forEach(([key, node]) => resetTransform(node, base[key]));

  const baseY = model.userData.baseY || 0;
  const baseRotationY = model.userData.baseRotationY || 0;
  model.position.y = baseY + Math.sin(elapsed * 2.0) * 0.025;
  model.rotation.y = baseRotationY + Math.sin(elapsed * 0.55) * 0.035;
  model.rotation.z = 0;

  const blink = Math.sin(elapsed * 0.9) > 0.985 ? 0.12 : 1;
  if (parts.leftEye && parts.rightEye) {
    parts.leftEye.scale.y *= blink;
    parts.rightEye.scale.y *= blink;
  }

  if (parts.topFeatherLeft && parts.topFeatherMid && parts.topFeatherRight) {
    parts.topFeatherLeft.rotation.z += Math.sin(elapsed * 2.2) * 0.06;
    parts.topFeatherMid.rotation.z += Math.sin(elapsed * 2.4 + 0.6) * 0.035;
    parts.topFeatherRight.rotation.z += Math.sin(elapsed * 2.0 + 1.0) * 0.06;
  }

  const open = speaking ? (Math.sin(elapsed * 18) + 1) / 2 : 0;
  if (speaking) {
    if (parts.upperBeak) {
      parts.upperBeak.position.y += open * 0.006;
      parts.upperBeak.rotation.x -= open * 0.02;
    }
    if (parts.lowerBeak) {
      parts.lowerBeak.position.y -= open * 0.014;
      parts.lowerBeak.rotation.x += open * 0.035;
    }
    if (parts.body) {
      parts.body.scale.y *= 1 + open * 0.012;
    }
    if (parts.mouth && !parts.lowerBeak) {
      if (parts.nose) {
        parts.nose.scale.y *= 1 + open * 0.04;
      }
    }
  }

  if (emotion === "happy" || emotion === "excited") {
    if (parts.leftEye && parts.rightEye) {
      parts.leftEye.scale.y *= 0.72;
      parts.rightEye.scale.y *= 0.72;
    }
    if (parts.leftCheek && parts.rightCheek) {
      parts.leftCheek.scale.x *= 1.14;
      parts.rightCheek.scale.x *= 1.14;
    }
  }

  if (parts.mouth && !parts.lowerBeak) {
    const isHappy = emotion === "happy" || emotion === "excited";
    scaleAroundGeometryCenter(parts.mouth, base.mouth, {
      x: (isHappy ? 1.14 : 1) * (1 - open * 0.04),
      y: (isHappy ? 1.06 : 1) * (1 + open * 0.28),
      z: 1,
    });
  }

  if (emotion === "sleepy") {
    if (parts.leftEye && parts.rightEye) {
      parts.leftEye.scale.y *= 0.26;
      parts.rightEye.scale.y *= 0.26;
    }
    model.position.y -= 0.025;
  }

  if (emotion === "thinking" || action === "thinking") {
    model.rotation.z = 0.025 + Math.sin(elapsed * 1.5) * 0.018;
  }

  if (action === "shake_head") {
    model.rotation.y = baseRotationY + Math.sin(elapsed * 8) * 0.14;
  }

  if (action === "wave" && parts.rightWing) {
    parts.rightWing.rotation.z -= 0.6 + Math.sin(elapsed * 10) * 0.28;
    parts.rightWing.position.y += 0.06;
  }

  if (action === "explain") {
    if (parts.rightWing) parts.rightWing.rotation.z -= 0.36 + Math.sin(elapsed * 4) * 0.1;
    if (parts.leftWing) parts.leftWing.rotation.z += 0.22 + Math.cos(elapsed * 3) * 0.08;
  }

  if (action === "celebrate") {
    model.position.y += Math.abs(Math.sin(elapsed * 7)) * 0.055;
    if (parts.leftWing) parts.leftWing.rotation.z += 0.5 + Math.sin(elapsed * 12) * 0.2;
    if (parts.rightWing) parts.rightWing.rotation.z -= 0.5 + Math.sin(elapsed * 12) * 0.2;
  }
}

export default function AvatarScene({
  emotion,
  action,
  speaking,
  modelPath = "/models/untitled-colored.glb",
  sunglasses = false,
  verticalOffset = 0,
}) {
  const containerRef = useRef(null);
  const vrmRef = useRef(null);
  const glbRef = useRef(null);
  const fallbackRef = useRef(null);
  const latestStateRef = useRef({ emotion, action, speaking, sunglasses });

  useEffect(() => {
    latestStateRef.current = { emotion, action, speaking, sunglasses };
  }, [emotion, action, speaking, sunglasses]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.1, 50);

    function frameAvatar() {
      const aspect = container.clientWidth / container.clientHeight;
      const isNarrow = aspect < 0.72;
      camera.position.set(0, isNarrow ? 1.08 : 1.16, isNarrow ? 5.05 : 4.05);
      camera.fov = isNarrow ? 34 : 30;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    frameAvatar();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(1.4, 3.2, 3.3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9ee8ff, 1.6);
    rimLight.position.set(-2.4, 1.8, -1.8);
    scene.add(rimLight);

    const warmFill = new THREE.PointLight(0xffd6a6, 1.6, 5);
    warmFill.position.set(-1.6, 1.2, 1.7);
    scene.add(warmFill);

    const ambient = new THREE.AmbientLight(0xffffff, 1.35);
    scene.add(ambient);

    const floorGeometry = new THREE.CircleGeometry(1.18, 80);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0xf8fbff,
      transparent: true,
      opacity: 0.72,
      roughness: 0.64,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.08;
    scene.add(floor);

    fallbackRef.current = createFallbackMascot(scene);

    loadGLB(
      modelPath,
      scene,
      (model) => {
        if (disposed) {
          scene.remove(model);
          return;
        }
        glbRef.current = model;
        model.scale.setScalar(0.9);
        model.position.y = 0.28 + verticalOffset;
        model.userData.baseY = model.position.y;
        prepareGLBAvatar(model);
        const fallback = fallbackRef.current;
        if (fallback?.parent) {
          fallback.parent.remove(fallback);
        }
        if (fallbackRef.current === fallback) {
          fallbackRef.current = null;
        }
      },
      (error) => {
        console.info("GLB prototype not loaded. Using fallback mascot.", error?.message || error);
      }
    );

    loadVRM(
      "/models/momo.vrm",
      scene,
      (vrm) => {
        if (disposed) {
          scene.remove(vrm.scene);
          return;
        }
        vrmRef.current = vrm;
        const glb = glbRef.current;
        if (glb?.parent) {
          glb.parent.remove(glb);
        }
        if (glbRef.current === glb) {
          glbRef.current = null;
        }
        const fallback = fallbackRef.current;
        if (fallback?.parent) {
          fallback.parent.remove(fallback);
        }
        if (fallbackRef.current === fallback) {
          fallbackRef.current = null;
        }
      },
      (error) => {
        console.info("VRM model not loaded. Using fallback mascot.", error?.message || error);
      }
    );

    const clock = new THREE.Clock();
    let frameId = 0;

    function animate() {
      frameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const { emotion, action, speaking, sunglasses } = latestStateRef.current;

      if (vrmRef.current) {
        vrmRef.current.update(delta);
        vrmRef.current.scene.position.y = Math.sin(elapsed * 2.0) * 0.025;
        applyEmotion(vrmRef.current, emotion, speaking, elapsed);
        applyMotion(vrmRef.current, action, elapsed);
      }

      if (glbRef.current) {
        if (glbRef.current.userData.sunglasses) {
          glbRef.current.userData.sunglasses.visible = sunglasses;
        }
        const audioLevel = sampleAudioLevel();
        updateGLBAvatar(glbRef.current, emotion, action, speaking, elapsed, audioLevel, delta);
      }

      if (fallbackRef.current) {
        updateFallbackMascot(fallbackRef.current, emotion, action, speaking, elapsed);
      }

      floor.scale.setScalar(1 + Math.sin(elapsed * 1.4) * 0.015);
      renderer.render(scene, camera);
    }

    animate();

    function handleResize() {
      if (!container.clientWidth || !container.clientHeight) return;
      frameAvatar();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }

    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
    };
  }, [modelPath]);

  return <div ref={containerRef} className="avatar-layer" />;
}
