import { getTtsApiBase } from "./llmApi.js";

export async function transcribeAudio(blob) {
  const res = await fetch(`${getTtsApiBase()}/stt`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`STT API failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  return (data.text || "").trim();
}
