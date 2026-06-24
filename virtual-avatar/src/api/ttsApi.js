import { getTtsApiBase } from "./llmApi.js";

export async function getTTSHealth() {
  const res = await fetch(`${getTtsApiBase()}/health`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS health failed: ${res.status} ${errorText}`);
  }

  return await res.json();
}

export async function synthesizeSpeech(text, options = {}) {
  const params = new URLSearchParams({
    text,
    rate: String(options.rate || 1),
  });
  if (options.voice) {
    params.set("voice", options.voice);
  }

  const res = await fetch(`${getTtsApiBase()}/tts?${params}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS API failed: ${res.status} ${errorText}`);
  }

  return await res.blob();
}
