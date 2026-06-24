const SYSTEM_PROMPT = `
너는 홈솔루션 미니 로봇의 의사결정 엔진이다.

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
  "cards": [
    {
      "title": "카드 제목",
      "items": ["항목1", "항목2"]
    }
  ]
}

규칙:
- text는 1~3문장으로 짧게.
- 위험하거나 불확실한 자동 제어는 바로 실행하지 말고 확인을 요청.
- emotion과 action은 반드시 enum 중 하나.
- JSON 외의 설명을 출력하지 마라.
`.trim();

const ALLOWED_EMOTIONS = new Set(["idle", "happy", "thinking", "concerned", "sleepy", "excited"]);
const ALLOWED_ACTIONS = new Set(["idle", "nod", "shake_head", "wave", "explain", "thinking", "celebrate"]);

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
  const cleaned = stripModelArtifacts(text)
    .replace(/\s+/g, " ")
    .trim();

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
  const emotion = ALLOWED_EMOTIONS.has(data?.emotion) ? data.emotion : "thinking";
  const action = ALLOWED_ACTIONS.has(data?.action) ? data.action : "thinking";
  const cards = Array.isArray(data?.cards) ? data.cards : [];

  return {
    text: String(data?.text || "좋아요. 확인해볼게요.").slice(0, 240),
    emotion,
    action,
    cards: cards.slice(0, 4).flatMap((card) => {
      if (!card || typeof card !== "object") return [];
      const items = Array.isArray(card.items) ? card.items : [card.items];
      return [{
        title: String(card.title || "정보").slice(0, 40),
        items: items.filter(Boolean).map((item) => String(item).slice(0, 80)).slice(0, 6),
      }];
    }),
  };
}

function extractPartialJsonText(raw) {
  const match = /"text"\s*:\s*"/g.exec(raw);
  if (!match) return "";

  let result = "";
  let escaped = false;

  for (let index = match.index + match[0].length; index < raw.length; index += 1) {
    const char = raw[index];

    if (!escaped) {
      if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
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
      const deltaText = normalizeContentText(delta?.content || delta?.reasoning_content || "");
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

  return content.trim();
}

async function callOpenAICompatible(userText, context, options = {}) {
  const apiBase = getEnvBase("VITE_PI_API_BASE", getDefaultApiBase());
  const model = import.meta.env.VITE_LLM_MODEL || "distributed-llama";
  const useStreaming = String(import.meta.env.VITE_LLM_STREAM || "true").toLowerCase() === "true";
  const res = await fetch(`${apiBase}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(userText, context) },
      ],
      temperature: 0.2,
      stream: useStreaming,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`OpenAI-compatible LLM API failed: ${res.status} ${errorText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  const responseJson = contentType.includes("application/json") ? await res.json() : null;
  const rawText = contentType.includes("text/event-stream")
    ? await readStreamingChatResponse(res, options.onTextDelta)
    : normalizeContentText(responseJson?.choices?.[0]?.message?.content || "");

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
  return await callOpenAICompatible(userText, context, options);
}

export function getApiBase() {
  return getEnvBase("VITE_PI_API_BASE", getDefaultApiBase());
}

export function getTtsApiBase() {
  const fallback = typeof window === "undefined"
    ? "http://localhost:8080"
    : `${window.location.protocol}//${window.location.hostname}:8080`;
  return getEnvBase("VITE_TTS_API_BASE", fallback);
}
