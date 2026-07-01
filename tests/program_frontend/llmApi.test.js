/**
 * program_frontend / api/llmApi.js 단위 테스트.
 *
 * 요구사항 매핑(요구사항_명세서.md):
 *   R-02  LLM 통신     — OpenAI 호환 엔드포인트로 POST, 응답 수신
 *   R-03  응답 스키마   — {text, homeSolution{devices}} 파싱·허용 가전/상태 정규화
 *   R-07  동작 트리거   — homeSolution.devices → 라즈베리파이 LED 제어
 *   R-12  가전 제어     — 매핑된 가전만 LED on/off 명령으로 변환
 *
 * distributed-llama 추론 서버와 Pi LED 서버 호출은 global.fetch 를 mock 해
 * 네트워크 없이 프롬프트/정규화/매핑 로직만 검증한다. 모듈 전역 세션 상태가
 * 테스트 간 새지 않도록 매 테스트마다 모듈을 새로 import 한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const MODULE = "../../src/program_frontend/src/api/llmApi.js";

function jsonResponse(content) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => "",
  };
}

let llm;
beforeEach(async () => {
  vi.resetModules();
  llm = await import(MODULE);
  global.fetch = vi.fn();
});

describe("R-03 캐릭터 응답 스키마 검증/정규화 (askPiLLM)", () => {
  it("허용 가전만 남기고 필드 길이를 제한한다", async () => {
    const raw = {
      text: "가".repeat(300), // 240 초과 → 잘림
      homeSolution: {
        title: "제".repeat(50), // 34 초과 → 잘림
        summary: "요".repeat(100), // 80 초과 → 잘림
        devices: [
          { name: "TV", state: "상".repeat(50), status: "active" }, // state 36자 제한
          { name: "조명", status: "이상한값" }, // status → idle, state 기본 "준비"
          { name: "정체불명가전", state: "x", status: "active" }, // 허용 목록에 없음 → 제거
        ],
      },
    };
    global.fetch.mockResolvedValue(jsonResponse(JSON.stringify(raw)));

    const res = await llm.askPiLLM("불 켜줘", {});

    expect(res.text.length).toBe(240);
    expect(res.homeSolution.title.length).toBe(34);
    expect(res.homeSolution.summary.length).toBe(80);

    const names = res.homeSolution.devices.map((d) => d.name);
    expect(names).toEqual(["TV", "조명"]);
    expect(res.homeSolution.devices[0].state.length).toBe(36);
    expect(res.homeSolution.devices[1]).toMatchObject({ state: "준비", status: "idle" });
  });

  it("코드블록/think 태그로 감싼 JSON도 파싱한다", async () => {
    const wrapped =
      "<think>고민중</think>```json\n" +
      JSON.stringify({ text: "처리했습니다.", homeSolution: { devices: [] } }) +
      "\n```";
    global.fetch.mockResolvedValue(jsonResponse(wrapped));

    const res = await llm.askPiLLM("상태 알려줘", {});
    expect(res.text).toBe("처리했습니다.");
  });

  it("JSON 이 아니면 텍스트 폴백으로 응답한다", async () => {
    global.fetch.mockResolvedValue(jsonResponse("그냥 인사말입니다. JSON 아님"));

    const res = await llm.askPiLLM("안녕", {});
    expect(res.text).toBe("그냥 인사말입니다. JSON 아님");
    expect(res.homeSolution.devices).toEqual([]);
  });

  it("R-02: OpenAI 호환 엔드포인트로 POST 한다", async () => {
    global.fetch.mockResolvedValue(jsonResponse(JSON.stringify({ text: "네" })));
    await llm.askPiLLM("테스트", {});

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("/v1/chat/completions");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe("distributed-llama");
    expect(sent.messages[0].role).toBe("system");
  });
});

describe("R-07/R-12 가전 → LED 제어 매핑", () => {
  it("매핑된 가전만 LED on/off 명령으로 변환해 전송한다", () => {
    global.fetch.mockResolvedValue({ ok: true });
    llm.sendDeviceCommands([
      { name: "TV", status: "active" }, // A on
      { name: "조명", status: "idle" }, // B off
      { name: "정수기", status: "active" }, // F on
      { name: "로봇청소기", status: "active" }, // LED 매핑 없음(프론트 표) → 제외
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("http://10.56.131.40:5000/led");
    const { commands } = JSON.parse(init.body);
    expect(commands).toEqual([
      { led: "A", state: "on" },
      { led: "B", state: "off" },
      { led: "F", state: "on" },
    ]);
  });

  it("제어할 가전이 없으면 요청하지 않는다", () => {
    global.fetch.mockResolvedValue({ ok: true });
    llm.sendDeviceCommands([{ name: "로봇청소기", status: "active" }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("turnOffAllLeds 는 6개 LED 를 모두 off 로 보낸다", () => {
    global.fetch.mockResolvedValue({ ok: true });
    llm.turnOffAllLeds();

    const { commands } = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(commands).toHaveLength(6);
    expect(commands.every((c) => c.state === "off")).toBe(true);
  });
});

describe("R-02 설정 기본값 (엔드포인트/모델)", () => {
  it("모델/베이스 URL 기본값을 반환한다", () => {
    expect(llm.getLlmModel()).toBe("distributed-llama");
    expect(llm.getApiBase()).toBe("http://localhost:8000");
    expect(llm.getTtsApiBase()).toBe("http://localhost:8080");
  });
});
