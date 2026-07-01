/**
 * program_frontend / api/ttsApi.js 단위 테스트.
 *
 * 요구사항 매핑:
 *   R-05  음성 합성(TTS) 클라이언트 — 텍스트+옵션 → /tts 쿼리 구성, WAV(blob) 수신, 캐싱
 *   R-05  서버 상태(health) 클라이언트 — /health, /voices 조회
 *
 * 백엔드 TTS 서버 호출은 global.fetch 를 mock 한다. 모듈 내부 speechCache 가
 * 테스트 간 새지 않도록 매 테스트마다 모듈을 새로 import 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const MODULE = "../../src/program_frontend/src/api/ttsApi.js";

let tts;
beforeEach(async () => {
  vi.resetModules();
  tts = await import(MODULE);
  global.fetch = vi.fn();
});

describe("R-05 음성 합성 클라이언트", () => {
  it("text/rate/voice/prosody 를 쿼리로 구성하고 blob 을 반환한다", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    global.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });

    const out = await tts.synthesizeSpeech("안녕", {
      rate: 1.2,
      voice: "teemo",
      sdpRatio: 0.7,
      noiseScaleW: 0.9,
    });
    expect(out).toBe(blob);

    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/tts");
    expect(url.searchParams.get("text")).toBe("안녕");
    expect(url.searchParams.get("rate")).toBe("1.2");
    expect(url.searchParams.get("voice")).toBe("teemo");
    expect(url.searchParams.get("sdp_ratio")).toBe("0.7");
    expect(url.searchParams.get("noise_scale_w")).toBe("0.9");
  });

  it("같은 요청은 캐시해서 한 번만 합성한다", async () => {
    const blob = new Blob(["x"]);
    global.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });

    await tts.synthesizeSpeech("반복", { rate: 1 });
    await tts.synthesizeSpeech("반복", { rate: 1 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("실패하면 에러를 던지고 캐시에 남기지 않는다", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    await expect(tts.synthesizeSpeech("에러", {})).rejects.toThrow(/TTS API failed: 500/);

    // 캐시에 실패가 남지 않아 재시도가 다시 fetch 를 호출한다
    const blob = new Blob(["ok"]);
    global.fetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    await expect(tts.synthesizeSpeech("에러", {})).resolves.toBe(blob);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe("R-05 상태 조회 클라이언트", () => {
  it("getTTSHealth 는 /health JSON 을 반환한다", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, backend: "melo" }) });
    const health = await tts.getTTSHealth();
    expect(health).toMatchObject({ ok: true, backend: "melo" });
    expect(new URL(global.fetch.mock.calls[0][0]).pathname).toBe("/health");
  });

  it("getTTSVoices 는 voices 배열을 반환한다", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [{ name: "teemo", lang: "ko" }] }),
    });
    const voices = await tts.getTTSVoices();
    expect(voices).toEqual([{ name: "teemo", lang: "ko" }]);
  });
});
