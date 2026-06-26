import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS dev 서버 + 백엔드 프록시.
// 마이크(getUserMedia)는 보안 컨텍스트에서만 켜지므로 LAN 접속용으로 dev 서버를 HTTPS 로 띄운다.
// HTTPS 페이지는 http 백엔드를 직접 fetch 할 수 없어(mixed content) 두 백엔드를 모두 프록시한다:
//   /v1, /reset            → 라즈베리파이 LLM (VITE_PI_API_BASE)
//   /health /voices /tts /stt → 맥 TTS/STT 서버 (VITE_TTS_API_BASE, 기본 localhost:8080)
// 프론트는 HTTPS 일 때 same-origin 상대경로로 호출하므로 이 프록시를 그대로 탄다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const llmTarget = env.VITE_PI_API_BASE || "http://localhost:8000";
  const ttsTarget = env.VITE_TTS_API_BASE || "http://localhost:8080";
  const proxy = Object.fromEntries(
    [
      ["/v1", llmTarget],
      ["/reset", llmTarget],
      ["/health", ttsTarget],
      ["/voices", ttsTarget],
      ["/tts", ttsTarget],
      ["/stt", ttsTarget],
    ].map(([path, target]) => [path, { target, changeOrigin: true }]),
  );

  return {
    plugins: [react(), basicSsl()],
    server: {
      host: "0.0.0.0",
      https: true,
      proxy,
    },
  };
});
