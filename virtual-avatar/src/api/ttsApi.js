import { getTtsApiBase } from "./llmApi.js";

const speechCache = new Map();

function getSpeechCacheKey(text, options) {
  return JSON.stringify([
    getTtsApiBase(),
    text.trim(),
    options.rate || 1,
    options.voice || "",
    options.sdpRatio ?? "",
    options.noiseScaleW ?? "",
  ]);
}

export async function getTTSHealth() {
  const res = await fetch(`${getTtsApiBase()}/health`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS health failed: ${res.status} ${errorText}`);
  }

  return await res.json();
}

export async function getTTSVoices() {
  const res = await fetch(`${getTtsApiBase()}/voices`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS voices failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return Array.isArray(data.voices) ? data.voices : [];
}

export async function synthesizeSpeech(text, options = {}) {
  const cacheKey = getSpeechCacheKey(text, options);
  if (speechCache.has(cacheKey)) {
    return await speechCache.get(cacheKey);
  }

  const request = fetchSpeech(text, options);
  speechCache.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    speechCache.delete(cacheKey);
    throw error;
  }
}

async function fetchSpeech(text, options) {
  const params = new URLSearchParams({
    text,
    rate: String(options.rate || 1),
  });
  if (options.voice) {
    params.set("voice", options.voice);
  }
  if (options.sdpRatio != null) {
    params.set("sdp_ratio", String(options.sdpRatio));
  }
  if (options.noiseScaleW != null) {
    params.set("noise_scale_w", String(options.noiseScaleW));
  }

  const res = await fetch(`${getTtsApiBase()}/tts?${params}`);

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`TTS API failed: ${res.status} ${errorText}`);
  }

  return await res.blob();
}

export async function prefetchSpeech(text, options = {}) {
  await synthesizeSpeech(text, options);
}
