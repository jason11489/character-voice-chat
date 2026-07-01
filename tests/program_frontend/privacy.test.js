/**
 * program_frontend / 로컬 처리(프라이버시) 단위 테스트.
 *
 * 요구사항 매핑(요구사항_명세서.md):
 *   R-16  모든 추론/제어가 로컬 LAN 내에서 처리 — 외부 인터넷 호스트로 나가지 않는다
 *
 * 코드 레벨 근거: 추론(LLM)·음성(TTS)·가전 제어(LED)의 기본 엔드포인트가
 * localhost 또는 사설 LAN(RFC1918) 대역만 가리키는지 검증한다.
 * (실제 트래픽 부재의 최종 입증은 네트워크 캡처 로그로 별도 수행)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const MODULE = "../../src/program_frontend/src/api/llmApi.js";

// localhost 또는 사설 LAN(10/8, 172.16/12, 192.168/16) 만 허용
const LOCAL_RE = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?/;

let llm;
beforeEach(async () => {
  vi.resetModules();
  llm = await import(MODULE);
  global.fetch = vi.fn();
});

describe("R-16 추론·음성 엔드포인트가 로컬/사설 LAN 만 가리킨다", () => {
  it("LLM(base) 기본 주소가 로컬/LAN 대역이다", () => {
    expect(llm.getApiBase()).toMatch(LOCAL_RE);
  });

  it("TTS 기본 주소가 로컬/LAN 대역이다", () => {
    expect(llm.getTtsApiBase()).toMatch(LOCAL_RE);
  });

  it("어떤 엔드포인트도 공개 인터넷 도메인(.com/.net 등)을 쓰지 않는다", () => {
    for (const base of [llm.getApiBase(), llm.getTtsApiBase()]) {
      expect(base).not.toMatch(/\.(com|net|org|io|ai|co)(\/|:|$)/);
    }
  });
});

describe("R-16 가전 제어(LED)도 사설 LAN 으로만 전송된다", () => {
  it("sendDeviceCommands 는 사설 LAN LED 서버로 POST 한다", () => {
    global.fetch.mockResolvedValue({ ok: true });
    llm.sendDeviceCommands([{ name: "TV", status: "active" }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toMatch(LOCAL_RE); // 10.x 사설 대역
    expect(url).not.toMatch(/\.(com|net|org|io|ai|co)(\/|:|$)/);
  });
});
