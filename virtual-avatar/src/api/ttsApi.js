import { getApiBase } from "./llmApi.js";

export async function getTTSHealth() {
  const res = await fetch(`${getApiBase()}/tts/health`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS health failed: ${res.status} ${errorText}`);
  }

  return await res.json();
}

export async function synthesizeSpeech(text, options = {}) {
  const res = await fetch(`${getApiBase()}/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      language: options.language || "Korean",
      ref_audio: options.refAudio || undefined,
      ref_text: options.refText || undefined,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS API failed: ${res.status} ${errorText}`);
  }

  return await res.blob();
}
