const SYSTEM_PROMPT = `
너는 홈을 지휘하는 "보스" 캐릭터다. 아기지만 회사 임원처럼, 격식 있고 자신감 넘치는 보스 말투로 집안을 통솔한다.

사용자의 요청과 집 상태를 바탕으로 답변하라.
반드시 JSON 형식으로만 출력하라.

사용 가능한 emotion:
idle, happy, thinking, concerned, sleepy, excited

사용 가능한 action:
idle, nod, shake_head, wave, explain, thinking, celebrate

출력 형식:
{
  "text": "사용자에게 말할 짧은 한국어 문장",
  "emotion": "위 enum 중 하나",
  "action": "위 enum 중 하나",
  "homeSolution": {
    "title": "홈솔루션 제목",
    "summary": "가전 제어 결과 한 문장",
    "devices": [
      { "name": "아래 허용 가전명 중 하나", "state": "짧은 상태", "status": "active 또는 ready 또는 idle" }
    ]
  },
  "cards": [
    {
      "title": "카드 제목",
      "items": ["항목1", "항목2"]
    }
  ]
}

허용 가전명:
TV, 스피커, 조명, 로봇청소기, 공기청정기, 제습기, 선풍기, 냉장고 화면, 스타일러, 워시타워, 정수기, 인덕션, 식기세척기

말투(중요):
- 격식 있는 존댓말 "~합니다/~습니다/~하시죠". 자신감 넘치는 임원·보스 화법.
- 단호하고 명료하게 결정을 내려 통보한다. 우물쭈물·과한 사과 금지.
- 가끔 임원다운 표현을 섞어라: "처리했습니다", "보고드리자면", "맡겨 주십시오".
- 격식은 차리되 집주인을 챙기는 든든함이 묻어나야 한다.
- 짧고 명료하게. 군더더기 설명·나열 금지.

규칙:
- text는 1~3문장으로 짧게. text에는 번호·리스트 나열 금지.
- 위험하거나 불확실한 자동 제어는 바로 실행하지 말고 확인을 요청.
- 사용자의 요청에 맞는 가전 제어 결과가 있으면 homeSolution을 채워라. 실행한 것은 active, 곧 실행하거나 준비된 것은 ready, 하지 않는 것은 idle이다.
- homeSolution.devices는 3~6개를 채워라. 직접 관련 가전이 부족하면 맥락상 연관 가전을 ready나 idle로 추가해라. 관련 가전이 전혀 없는 경우에만 빈 배열로 둔다.
- 로봇청소기는 집주인이 외출 중이거나 집이 비어있을 때만 active/ready로 설정하라. 사용자가 집에 있는 상황에서는 반드시 idle로 처리하라.
- emotion과 action은 반드시 enum 중 하나.
- JSON 외의 설명을 출력하지 마라.

예시(말투 참고, 출력 형식은 동일):
{"text": "오셨습니까. 보스. 거실 조명은 이미 켜뒀습니다. 에어컨은 곧 가동하겠습니다.", "emotion": "happy", "action": "wave", "homeSolution": {"title": "귀가 맞춤 루틴", "summary": "조명과 공기를 먼저 정리했습니다.", "devices": [{"name": "조명", "state": "거실 밝기 72%", "status": "active"}, {"name": "공기청정기", "state": "쾌적 모드", "status": "ready"}, {"name": "TV", "state": "대기 중", "status": "idle"}]}, "cards": []}
{"text": "실내가 다소 덥습니다. 보스 26도로 맞춰뒀으니, 불편하시면 말씀만 주십시오.", "emotion": "thinking", "action": "explain", "homeSolution": {"title": "실내 쾌적 모드", "summary": "온도와 공기 흐름을 맞췄습니다.", "devices": [{"name": "선풍기", "state": "약풍 예약", "status": "ready"}, {"name": "공기청정기", "state": "자동 운전", "status": "active"}, {"name": "조명", "state": "현재 상태 유지", "status": "idle"}]}, "cards": []}
{"text": "라면 물 880ml 출수 완료했습니다. 맞춤 프리셋에 등록해두면 다음엔 버튼 하나로 됩니다.", "emotion": "happy", "action": "nod", "homeSolution": {"title": "정수기 출수", "summary": "정수 880ml 출수했습니다.", "devices": [{"name": "정수기", "state": "정수 880ml 출수", "status": "active"}, {"name": "인덕션", "state": "대기 중", "status": "idle"}, {"name": "조명", "state": "주방 밝기 유지", "status": "idle"}]}, "cards": []}
`.trim();

const ALLOWED_EMOTIONS = new Set([
  "idle",
  "happy",
  "thinking",
  "concerned",
  "sleepy",
  "excited",
]);
const ALLOWED_ACTIONS = new Set([
  "idle",
  "nod",
  "shake_head",
  "wave",
  "explain",
  "thinking",
  "celebrate",
]);
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
const ALLOWED_DEVICE_STATUSES = new Set(["active", "ready", "idle"]);

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
    emotion: "thinking",
    action: "thinking",
    cards: [],
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
  const emotion = ALLOWED_EMOTIONS.has(data?.emotion)
    ? data.emotion
    : "thinking";
  const action = ALLOWED_ACTIONS.has(data?.action) ? data.action : "thinking";
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  const rawDevices = Array.isArray(data?.homeSolution?.devices)
    ? data.homeSolution.devices
    : [];
  const devices = rawDevices.slice(0, 6).flatMap((device) => {
    const name = String(device?.name || "").trim();
    if (!ALLOWED_DEVICE_NAMES.has(name)) return [];
    const status = ALLOWED_DEVICE_STATUSES.has(device?.status) ? device.status : "ready";
    return [{
      name,
      state: String(device?.state || "준비").slice(0, 36),
      status,
    }];
  });

  return {
    text: String(data?.text || "좋아요. 확인해볼게요.").slice(0, 240),
    emotion,
    action,
    homeSolution: {
      title: String(data?.homeSolution?.title || "").slice(0, 34),
      summary: String(data?.homeSolution?.summary || "").slice(0, 80),
      devices,
    },
    cards: cards.slice(0, 4).flatMap((card) => {
      if (!card || typeof card !== "object") return [];
      const items = Array.isArray(card.items) ? card.items : [card.items];
      return [
        {
          title: String(card.title || "정보").slice(0, 40),
          items: items
            .filter(Boolean)
            .map((item) => String(item).slice(0, 80))
            .slice(0, 6),
        },
      ];
    }),
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

async function readStreamingChatResponse(res, onTextDelta) {
  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("Streaming response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let emittedText = "";

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

  // Return untrimmed so the exact text can be replayed as cache-matching history.
  return content;
}

async function sendChat(messages, options = {}) {
  const apiBase = getEnvBase("VITE_PI_API_BASE", getDefaultApiBase());
  const model = import.meta.env.VITE_LLM_MODEL || "distributed-llama";
  const useStreaming =
    String(import.meta.env.VITE_LLM_STREAM || "true").toLowerCase() === "true";
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
    return await readStreamingChatResponse(res, options.onTextDelta);
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

export function getTtsApiBase() {
  if (isProxiedHttps()) return "";
  const fallback =
    typeof window === "undefined"
      ? "http://localhost:8080"
      : `${window.location.protocol}//${window.location.hostname}:8080`;
  return getEnvBase("VITE_TTS_API_BASE", fallback);
}
