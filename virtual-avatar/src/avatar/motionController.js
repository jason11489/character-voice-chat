function getBone(vrm, boneName) {
  return vrm.humanoid?.getNormalizedBoneNode(boneName) || null;
}

function resetBoneRotation(node) {
  if (!node) return;
  node.rotation.x = 0;
  node.rotation.y = 0;
  node.rotation.z = 0;
}

export function applyMotion(vrm, action, elapsed) {
  if (!vrm?.humanoid) return;

  const head = getBone(vrm, "head");
  const chest = getBone(vrm, "chest");
  const leftUpperArm = getBone(vrm, "leftUpperArm");
  const rightUpperArm = getBone(vrm, "rightUpperArm");

  resetBoneRotation(head);
  resetBoneRotation(chest);
  resetBoneRotation(leftUpperArm);
  resetBoneRotation(rightUpperArm);

  // 기본 숨쉬는 느낌
  if (head) {
    head.rotation.y = Math.sin(elapsed * 0.8) * 0.055;
    head.rotation.x = Math.sin(elapsed * 0.5) * 0.025;
  }

  if (chest) {
    chest.rotation.z = Math.sin(elapsed * 1.2) * 0.015;
  }

  if (action === "thinking") {
    if (head) {
      head.rotation.z = 0.18;
      head.rotation.y += Math.sin(elapsed * 1.5) * 0.08;
    }
  }

  if (action === "nod") {
    if (head) {
      head.rotation.x = Math.sin(elapsed * 8) * 0.18;
    }
  }

  if (action === "shake_head") {
    if (head) {
      head.rotation.y = Math.sin(elapsed * 8) * 0.25;
    }
  }

  if (action === "explain") {
    if (chest) {
      chest.rotation.y = Math.sin(elapsed * 2) * 0.08;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.z = -0.55 + Math.sin(elapsed * 3) * 0.18;
      rightUpperArm.rotation.x = -0.28;
    }
  }

  if (action === "wave") {
    if (rightUpperArm) {
      rightUpperArm.rotation.z = -1.15;
      rightUpperArm.rotation.x = Math.sin(elapsed * 10) * 0.45;
    }
  }

  if (action === "celebrate") {
    if (leftUpperArm) {
      leftUpperArm.rotation.z = 1.05;
      leftUpperArm.rotation.x = -0.15;
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.z = -1.05;
      rightUpperArm.rotation.x = -0.15;
    }
    if (chest) {
      chest.rotation.z = Math.sin(elapsed * 8) * 0.08;
    }
  }
}