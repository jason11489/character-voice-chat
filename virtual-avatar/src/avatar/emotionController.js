const CANDIDATE_EXPRESSIONS = [
  "happy",
  "sad",
  "angry",
  "relaxed",
  "surprised",
  "aa",
  "blink",
  "blinkLeft",
  "blinkRight",
];

function safeSetExpression(vrm, key, value) {
  try {
    vrm.expressionManager?.setValue(key, value);
  } catch {
    // VRM 모델마다 expression preset이 다를 수 있어 조용히 무시합니다.
  }
}

function resetExpressions(vrm) {
  CANDIDATE_EXPRESSIONS.forEach((key) => safeSetExpression(vrm, key, 0));
}

export function applyEmotion(vrm, emotion, speaking, elapsed) {
  if (!vrm?.expressionManager) return;

  resetExpressions(vrm);

  if (emotion === "happy") {
    safeSetExpression(vrm, "happy", 0.85);
  }

  if (emotion === "concerned") {
    safeSetExpression(vrm, "sad", 0.45);
  }

  if (emotion === "thinking") {
    safeSetExpression(vrm, "relaxed", 0.38);
    safeSetExpression(vrm, "blinkLeft", 0.12);
  }

  if (emotion === "sleepy") {
    safeSetExpression(vrm, "blink", 0.65);
    safeSetExpression(vrm, "relaxed", 0.45);
  }

  if (emotion === "excited") {
    safeSetExpression(vrm, "happy", 1.0);
    safeSetExpression(vrm, "surprised", 0.18);
  }

  if (speaking) {
    const mouth = (Math.sin(elapsed * 18) + 1) / 2;
    safeSetExpression(vrm, "aa", mouth * 0.78);
  }
}