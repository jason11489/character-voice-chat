function getDefaultApiBase() {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

const API_BASE = import.meta.env.VITE_PI_API_BASE || getDefaultApiBase();

export async function askPiLLM(userText, context = {}) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_text: userText,
      context,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`LLM API failed: ${res.status} ${errorText}`);
  }

  return await res.json();
}

export function getApiBase() {
  return API_BASE;
}
