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
    nose: byName.Nose,
    mouth: byName.Mouth,
    leftCheek: byName.LeftCheek,
    rightCheek: byName.RightCheek,
    topFeatherLeft: byName.TopFeatherLeft,
    topFeatherMid: byName.TopFeatherMid,
    topFeatherRight: byName.TopFeatherRight,
  };

  model.userData.parts = parts;
  model.userData.baseTransforms = Object.fromEntries(
    Object.entries(parts).map(([key, node]) => [key, captureTransform(node)])
  );
}

function updateGLBAvatar(model, emotion, action, speaking, elapsed) {
  const parts = model.userData.parts || {};
  const base = model.userData.baseTransforms || {};

  Object.entries(parts).forEach(([key, node]) => resetTransform(node, base[key]));

  const baseY = model.userData.baseY || 0;
  model.position.y = baseY + Math.sin(elapsed * 2.0) * 0.025;
  model.rotation.y = Math.sin(elapsed * 0.55) * 0.055;
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

  if (speaking) {
    const open = (Math.sin(elapsed * 18) + 1) / 2;
    if (parts.upperBeak) {
      parts.upperBeak.position.y += open * 0.014;
      parts.upperBeak.rotation.x -= open * 0.07;
    }
    if (parts.lowerBeak) {
      parts.lowerBeak.position.y -= open * 0.078;
      parts.lowerBeak.rotation.x += open * 0.12;
      parts.lowerBeak.scale.y *= 1 + open * 0.42;
    }
    if (parts.body) {
      parts.body.scale.y *= 1 + open * 0.012;
    }
    if (parts.mouth && !parts.lowerBeak) {
      parts.mouth.position.y -= open * 0.018;
      parts.mouth.scale.y *= 1 + open * 0.9;
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
    if (parts.mouth) {
      parts.mouth.scale.x *= 1.18;
      parts.mouth.scale.y *= 1.12;
    }
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
    model.rotation.y = Math.sin(elapsed * 8) * 0.14;
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

export default function AvatarScene({ emotion, action, speaking, modelPath = "/models/untitled-colored.glb" }) {
  const containerRef = useRef(null);
  const vrmRef = useRef(null);
  const glbRef = useRef(null);
  const fallbackRef = useRef(null);
  const latestStateRef = useRef({ emotion, action, speaking });

  useEffect(() => {
    latestStateRef.current = { emotion, action, speaking };
  }, [emotion, action, speaking]);

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
        model.position.y = 0.28;
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
      const { emotion, action, speaking } = latestStateRef.current;

      if (vrmRef.current) {
        vrmRef.current.update(delta);
        vrmRef.current.scene.position.y = Math.sin(elapsed * 2.0) * 0.025;
        applyEmotion(vrmRef.current, emotion, speaking, elapsed);
        applyMotion(vrmRef.current, action, elapsed);
      }

      if (glbRef.current) {
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
