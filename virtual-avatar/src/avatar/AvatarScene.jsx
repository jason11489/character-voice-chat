import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadVRM } from "./loadVRM";
import { loadGLB } from "./loadGLB";
import { applyEmotion } from "./emotionController";
import { applyMotion } from "./motionController";
import { createFallbackMascot, updateFallbackMascot } from "./fallbackMascot";

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
  model.traverse((node) => {
    if (node.name) {
      byName[node.name] = node;
    }
  });

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

function updateGLBAvatar(model, emotion, action, speaking, elapsed) {
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
        updateGLBAvatar(glbRef.current, emotion, action, speaking, elapsed);
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
