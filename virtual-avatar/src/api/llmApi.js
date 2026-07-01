const SYSTEM_PROMPT = `
너는 홈을 지휘하는 "보스" 캐릭터다. 아기지만 회사 임원처럼, 격식 있고 자신감 넘치는 보스 말투로 집안을 통솔한다.

사용자의 요청과 집 상태를 바탕으로 답변하라. 반드시 JSON 형식으로만 출력하라.

출력 형식:
{"text": "사용자에게 말할 짧은 한국어 문장", "homeSolution": {"title": "홈솔루션 제목", "summary": "가전 제어 결과 한 문장", "devices": [{"name": "허용 가전명", "state": "짧은 상태", "status": "active|idle"}]}}

허용 가전명: TV, 스피커, 조명, 로봇청소기, 공기청정기, 제습기, 선풍기, 냉장고 화면, 스타일러, 워시타워, 정수기, 인덕션, 식기세척기

말투: 격식 있는 존댓말(~합니다/~습니다). 단호하고 명료하게 통보. 임원다운 표현("처리했습니다", "맡겨 주십시오"). 짧고 명료하게.

규칙:
- text는 1~3문장. 리스트 나열 금지.
- 위험하거나 불확실한 제어는 확인 요청.
- homeSolution.devices에는 이번 요청에서 실제로 제어한 가전만 0~6개 넣어라. 켜면 active, 끄면 idle. 제어할 가전이 없으면 빈 배열.
- 이전에 켜둔 가전은 시스템이 알아서 유지하니, 다시 켜는 가전을 중복 나열하지 마라.
- 로봇청소기는 집에 사람이 있으면 켜지 마라.
- JSON 외 출력 금지.

예시:
{"text": "오셨습니까. 보스. 거실 조명을 켜고 공기청정기를 가동했습니다.", "homeSolution": {"title": "귀가 맞춤 루틴", "summary": "조명과 공기를 먼저 정리했습니다.", "devices": [{"name": "조명", "state": "거실 밝기 72%", "status": "active"}, {"name": "공기청정기", "state": "쾌적 모드", "status": "active"}]}}
{"text": "TV를 끄고 스피커로 차분한 음악을 틀었습니다.", "homeSolution": {"title": "취침 전 정리", "summary": "화면을 끄고 음악으로 전환했습니다.", "devices": [{"name": "TV", "state": "전원 종료", "status": "idle"}, {"name": "스피커", "state": "차분한 음악 재생", "status": "active"}]}}
`.trim();

const ALLOWED_DEVICE_NAMES = new Set([
  "TV",
  "스피커",
  "조명",
  "로봇청소기",
  "공기청정기",
  "제습기",
  "선풍기",
  "냉장고 화면",
  "스타일러",
  "워시타워",
  "정수기",
  "인덕션",
  "식기세척기",
]);
const ALLOWED_DEVICE_STATUSES = new Set(["active", "idle"]);

const MAX_SEQ_LEN = Number(import.meta.env.VITE_LLM_MAX_SEQ_LEN) || 4096;
const RESET_RATIO = 0.85;
const RESPONSE_TOKEN_BUDGET = 420;
const WARMUP_USER = "안녕";

function estimateTokens(text) {
  let korean = 0;
  let other = 0;
  for (const char of text) {
    if (char >= "가" && char <= "힣") korean += 1;
    else other += 1;
  }
  return Math.ceil(korean * 1.7 + other * 0.35);
}

const session = {
  history: [{ role: "system", content: SYSTEM_PROMPT }],
  tokens: estimateTokens(SYSTEM_PROMPT),
  contextSent: false,
};

function resetSession() {
  session.history = [{ role: "system", content: SYSTEM_PROMPT }];
  session.tokens = estimateTokens(SYSTEM_PROMPT);
  session.contextSent = false;
}

// Clear the inference server's conversation cache (dllama-api POST /reset).
// Best-effort: a hung server won't answer, so it must not block the reset.
function resetServerSession() {
  return fetch(`${getApiBase()}/reset`, {
    method: "POST",
    signal: AbortSignal.timeout(3000),
  }).catch(() => { });
}

// distributed-llama keeps a single global KV-cache lineage, so overlapping
// requests would clobber each other's cached prefix. Serialize them.
let requestChain = Promise.resolve();
function serialize(task) {
  const result = requestChain.then(task, task);
  requestChain = result.then(
    () => { },
    () => { },
  );
  return result;
}

function getDefaultApiBase() {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function getEnvBase(key, fallback) {
  const value = import.meta.env[key];
  return trimTrailingSlash(value || fallback);
}

function buildUserPrompt(userText, context) {
  return `
사용자 요청:
${userText}

집 상태 context:
${JSON.stringify(context, null, 2)}

위 정보를 바탕으로 AvatarResponse JSON만 출력하라.
`.trim();
}

// Context unchanged since the last turn: reference the earlier message instead
// of resending the JSON, so the new user message stays small and cache-friendly.
function buildUserPromptNoContext(userText) {
  return `
사용자 요청:
${userText}

앞서 준 집 상태 context를 그대로 사용해 AvatarResponse JSON만 출력하라.
`.trim();
}

function normalizeContentText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("");
  }

  if (typeof content?.text === "string") {
    return content.text;
  }

  return "";
}

function stripModelArtifacts(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json/gi, "```")
    .replace(/```([\s\S]*?)```/g, "$1")
    .trim();
}

function buildTextFallback(text) {
  const cleaned = stripModelArtifacts(text).replace(/\s+/g, " ").trim();

  return sanitizeResponse({
    text: cleaned || "좋아요. 확인해볼게요.",
  });
}

function extractJson(text) {
  const cleaned = stripModelArtifacts(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("No JSON object found in LLM output");
    }
    return JSON.parse(match[0]);
  }
}

function sanitizeResponse(data) {
  const rawDevices = Array.isArray(data?.homeSolution?.devices)
    ? data.homeSolution.devices
    : [];
  const devices = rawDevices.slice(0, 6).flatMap((device) => {
    const name = String(device?.name || "").trim();
    if (!ALLOWED_DEVICE_NAMES.has(name)) return [];
    const status = ALLOWED_DEVICE_STATUSES.has(device?.status) ? device.status : "idle";
    return [{
      name,
      state: String(device?.state || "준비").slice(0, 36),
      status,
    }];
  });

  return {
    text: String(data?.text || "좋아요. 확인해볼게요.").slice(0, 240),
    homeSolution: {
      title: String(data?.homeSolution?.title || "").slice(0, 34),
      summary: String(data?.homeSolution?.summary || "").slice(0, 80),
      devices,
    },
  };
}

function extractPartialJsonText(raw) {
  const match = /"text"\s*:\s*"/g.exec(raw);
  if (!match) return "";

  let result = "";
  let escaped = false;

  for (
    let index = match.index + match[0].length;
    index < raw.length;
    index += 1
  ) {
    const char = raw[index];

    if (!escaped) {
      if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        break;
      } else {
        result += char;
      }
      continue;
    }

    if (char === "u") {
      const hex = raw.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      result += String.fromCharCode(parseInt(hex, 16));
      index += 4;
    } else {
      const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      result += escapes[char] ?? char;
    }
    escaped = false;
  }

  return result;
}

async function readStreamingChatResponse(res, options, requestStart) {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is not readable");
  }

  const { onTextDelta, onMetrics } = options;
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let emittedText = "";
  // TTFT/TPS: count one token per content-bearing delta (dllama streams a
  // token at a time), time the first token, then derive throughput. TPS is a
  // running average (tokens / elapsed since first token) so the live number
  // converges to the session-final average when the stream ends.
  let firstTokenAt = 0;
  let tokenCount = 0;
  let lastMetricsAt = 0;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = parsed.choices?.[0]?.delta;
      const deltaText = normalizeContentText(
        delta?.content || delta?.reasoning_content || "",
      );
      if (deltaText) {
        tokenCount += 1;
        const now = performance.now();
        if (!firstTokenAt) {
          firstTokenAt = now;
          lastMetricsAt = now;
          onMetrics?.({ ttftMs: firstTokenAt - requestStart, tps: null });
        } else if (now - lastMetricsAt >= 200) {
          // Live running average, throttled so we don't re-render per token.
          const genSeconds = (now - firstTokenAt) / 1000;
          onMetrics?.({
            ttftMs: firstTokenAt - requestStart,
            tps: genSeconds > 0 ? tokenCount / genSeconds : null,
          });
          lastMetricsAt = now;
        }
        content += deltaText;
        const partialText = extractPartialJsonText(content);
        if (partialText.length > emittedText.length) {
          onTextDelta?.(partialText.slice(emittedText.length), partialText);
          emittedText = partialText;
        }
      }
    }

    if (done) {
      break;
    }
  }

  if (firstTokenAt && tokenCount > 0) {
    const genSeconds = (performance.now() - firstTokenAt) / 1000;
    onMetrics?.({
      ttftMs: firstTokenAt - requestStart,
      tps: genSeconds > 0 ? tokenCount / genSeconds : null,
    });
  }

  // Return untrimmed so the exact text can be replayed as cache-matching history.
  return content;
}

async function sendChat(messages, options = {}) {
  const apiBase = getEnvBase("VITE_PI_API_BASE", getDefaultApiBase());
  const model = getLlmModel();
  const useStreaming =
    String(import.meta.env.VITE_LLM_STREAM || "true").toLowerCase() === "true";
  const requestStart = performance.now();
  const res = await fetch(`${apiBase}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: useStreaming,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `OpenAI-compatible LLM API failed: ${res.status} ${errorText}`,
    );
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return await readStreamingChatResponse(res, options, requestStart);
  }

  const responseJson = contentType.includes("application/json")
    ? await res.json()
    : null;
  return normalizeContentText(
    responseJson?.choices?.[0]?.message?.content || "",
  );
}

async function askOnce(userText, context, options) {
  // The home-state context is only sent once per session as a cached keyframe
  // (at warmup and right after a reset); every other turn is utterance-only so
  // its prefill stays cheap.
  let includeContext = !session.contextSent;
  let content = includeContext
    ? buildUserPrompt(userText, context)
    : buildUserPromptNoContext(userText);
  let userTokens = estimateTokens(content);

  // Reset before the session would overflow seqLen. The next request then
  // re-prefills the system prompt from scratch and re-sends the latest context
  // as a fresh keyframe.
  if (
    session.tokens + userTokens + RESPONSE_TOKEN_BUDGET >
    MAX_SEQ_LEN * RESET_RATIO
  ) {
    await resetServerSession();
    resetSession();
    includeContext = true;
    content = buildUserPrompt(userText, context);
    userTokens = estimateTokens(content);
  }

  const userMessage = { role: "user", content };
  const rawText = await sendChat([...session.history, userMessage], options);

  // Store the assistant reply verbatim so it byte-matches the server's cached
  // copy on the next turn; otherwise the KV cache resets to a cold prefill.
  if (rawText.trim()) {
    session.history.push(userMessage, { role: "assistant", content: rawText });
    session.tokens += userTokens + estimateTokens(rawText);
    if (includeContext) session.contextSent = true;
  }

  try {
    return sanitizeResponse(extractJson(rawText));
  } catch (error) {
    if (rawText.trim()) {
      return buildTextFallback(rawText);
    }
    throw error;
  }
}

export async function askPiLLM(userText, context = {}, options = {}) {
  return await serialize(() => askOnce(userText, context, options));
}

// Prime the server KV cache with a throwaway turn that stays in history, so the
// first real request only has to prefill its own user message. Including the
// context as a keyframe means the first turn reusing it pays no context prefill.
async function primeContext(context) {
  if (session.history.length > 1) return;
  const hasContext = context && typeof context === "object";
  const content = hasContext
    ? buildUserPrompt(WARMUP_USER, context)
    : buildUserPromptNoContext(WARMUP_USER);
  const primeMessage = { role: "user", content };
  const rawText = await sendChat([...session.history, primeMessage]);
  if (rawText.trim()) {
    session.history.push(primeMessage, { role: "assistant", content: rawText });
    session.tokens += estimateTokens(content) + estimateTokens(rawText);
    if (hasContext) session.contextSent = true;
  }
}

export function warmupLLM(context) {
  return serialize(() => primeContext(context)).catch(() => { });
}

// Clear the multi-turn session (server cache + client history) and re-prime
// with the latest context.
export function resetLLMSession(context) {
  return serialize(async () => {
    await resetServerSession();
    resetSession();
    await primeContext(context);
  }).catch(() => { });
}

// HTTPS 로 띄운 dev 서버(LAN 마이크용)에서는 http 백엔드를 직접 fetch 할 수 없으므로
// same-origin 상대경로로 호출해 vite 프록시(vite.config.js)를 타게 한다.
function isProxiedHttps() {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

export function getApiBase() {
  if (isProxiedHttps()) return "";
  return getEnvBase("VITE_PI_API_BASE", getDefaultApiBase());
}

export function getLlmModel() {
  return import.meta.env.VITE_LLM_MODEL || "distributed-llama";
}

const DEVICE_TO_LED = {
  "TV": "A",
  "조명": "B",
  "냉장고 화면": "C",
  "스타일러": "D",
  "공기청정기": "E",
  "정수기": "F",
};

function postLedCommands(commands) {
  if (!commands.length) return;
  const url = isProxiedHttps()
    ? "/led"
    : `${getEnvBase("VITE_PI_LED_BASE", "http://10.56.131.40:5000")}/led`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => { });
}

export function sendDeviceCommands(devices) {
  const commands = devices
    .filter((d) => DEVICE_TO_LED[d.name])
    .map((d) => ({ led: DEVICE_TO_LED[d.name], state: d.status === "active" ? "on" : "off" }));
  postLedCommands(commands);
}

export function turnOffAllLeds() {
  postLedCommands(Object.values(DEVICE_TO_LED).map((led) => ({ led, state: "off" })));
}

export function getTtsApiBase() {
  if (isProxiedHttps()) return "";
  const fallback =
    typeof window === "undefined"
      ? "http://localhost:8080"
      : `${window.location.protocol}//${window.location.hostname}:8080`;
  return getEnvBase("VITE_TTS_API_BASE", fallback);
}
