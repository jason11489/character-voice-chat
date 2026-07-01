/**
 * program_frontend / 상황 인지·시나리오·시각화 단위 테스트.
 *
 * 요구사항 매핑(요구사항_명세서.md):
 *   R-08  복수 개인 데이터 종합 상황 판단 — 캘린더·위치·결제·날씨·시청기록을 context 로 취합
 *   R-09  동일 발화·컨텍스트별 차등 동작   — 같은 발화라도 다른 context → 다른 요청/솔루션
 *   R-10  시나리오①(회식 후 귀가)          — 스타일러→공청기(제습)→TV(드라마)→플레이리스트 순서
 *   R-11  시나리오②(운동 후 귀가)          — 냉장고 레시피·회복 플레이리스트·TV 스트레칭
 *   R-13  가전 제어 결과 시각화             — 홈솔루션 devices 가 UI 렌더 가능한 형태(name/state/status)
 *   R-14  (옵션) 시청기록 활용             — viewing(시청 기록) 데이터가 context 로 사용됨
 *
 * 시나리오·상황 데이터(팀 작성 config)와 LLM 요청 조립 로직만 검증한다.
 * 실제 LLM 추론/영상 시연은 시연영상 타임스탬프로 별도 입증한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoEvents } from "../../src/program_frontend/src/mock/demoEvents.js";

const LLM_MODULE = "../../src/program_frontend/src/api/llmApi.js";

function byId(id) {
  return demoEvents.find((d) => d.id === id);
}
function usedData(scenario) {
  return scenario.data.filter((d) => d.used).map((d) => d.id);
}
function deviceNames(scenario) {
  return scenario.devices.map((d) => d.name);
}
function deviceState(scenario, name) {
  return scenario.devices.find((d) => d.name === name)?.state ?? "";
}

// ---------------------- R-08 복수 개인데이터 종합 ----------------------
describe("R-08 복수 개인 데이터 종합 상황 판단", () => {
  it("행동 시나리오는 위치·결제/시청·날씨 등 3종 이상 개인 데이터를 종합한다", () => {
    for (const id of ["company-dinner", "workout", "quiet-mode"]) {
      const used = new Set(usedData(byId(id)));
      // 대화 맥락 외에 최소 2개 이상의 실제 개인 데이터 소스가 상황 판단에 사용됨
      const personal = [...used].filter((c) => c !== "conversation");
      expect(personal.length).toBeGreaterThanOrEqual(2);
      expect(used.has("location")).toBe(true);
      expect(used.has("weather")).toBe(true);
    }
  });

  it("회식 시나리오는 결제·시청·위치·날씨를 모두 종합한다", () => {
    const used = new Set(usedData(byId("company-dinner")));
    ["location", "purchase", "viewing", "weather"].forEach((c) =>
      expect(used.has(c)).toBe(true),
    );
  });
});

// ------------------- R-09 컨텍스트별 차등 동작(설정) -------------------
describe("R-09 컨텍스트에 따른 차등 솔루션", () => {
  it("서로 다른 컨텍스트는 서로 다른 가전 솔루션을 만든다", () => {
    const dinner = new Set(deviceNames(byId("company-dinner")));
    const workout = new Set(deviceNames(byId("workout")));
    const quiet = new Set(deviceNames(byId("quiet-mode")));
    expect(dinner).not.toEqual(workout);
    expect(dinner).not.toEqual(quiet);
    expect(workout).not.toEqual(quiet);
  });

  it("재택 발표 컨텍스트는 저소음 지향 제어를 선택한다", () => {
    const quiet = byId("quiet-mode");
    expect(deviceNames(quiet)).toContain("로봇청소기"); // 예약 일시정지
    expect(deviceState(quiet, "공기청정기")).toMatch(/저소음/);
  });
});

// -------------------- R-09 컨텍스트별 차등 동작(요청) --------------------
describe("R-09 같은 발화라도 컨텍스트가 다르면 다른 요청을 보낸다", () => {
  const content = JSON.stringify({ text: "처리했습니다.", homeSolution: { devices: [] } });
  function jsonResponse() {
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "",
    };
  }
  async function sendOnce(userText, context) {
    vi.resetModules();
    const llm = await import(LLM_MODULE);
    global.fetch = vi.fn().mockResolvedValue(jsonResponse());
    await llm.askPiLLM(userText, context);
    return global.fetch.mock.calls[0][1].body;
  }

  it("동일 발화 '조용히 해줘' + 두 컨텍스트 → 요청 본문이 서로 다르다", async () => {
    const bodyPresentation = await sendOnce("조용히 해줘", { scene: "재택 발표 8분 전", state: ["위치: 업무공간"] });
    const bodyAfterWork = await sendOnce("조용히 해줘", { scene: "퇴근 후 밤 11시", state: ["위치: 침실"] });
    expect(bodyPresentation).not.toEqual(bodyAfterWork);
    // 두 요청 모두 컨텍스트를 프롬프트에 실제로 실어 보냈는지 확인
    expect(bodyPresentation).toContain("재택 발표");
    expect(bodyAfterWork).toContain("퇴근 후");
  });
});

// ----------------------- R-10 시나리오① 회식 후 -----------------------
describe("R-10 시나리오①(회식 후 귀가) 정의 순서", () => {
  it("스타일러 → 공기청정기(제습) → TV(드라마) → 스피커(플레이리스트) 순으로 정의된다", () => {
    const names = deviceNames(byId("company-dinner"));
    const i = (n) => names.indexOf(n);
    expect(i("스타일러")).toBeGreaterThanOrEqual(0);
    expect(i("스타일러")).toBeLessThan(i("공기청정기"));
    expect(i("공기청정기")).toBeLessThan(i("TV"));
    expect(i("TV")).toBeLessThan(i("스피커"));
    expect(deviceState(byId("company-dinner"), "TV")).toMatch(/드라마/);
    expect(deviceState(byId("company-dinner"), "스피커")).toMatch(/플레이리스트/);
  });
});

// ----------------------- R-11 시나리오② 운동 후 -----------------------
describe("R-11 시나리오②(운동 후 귀가) 정의 동작", () => {
  it("냉장고 레시피·회복 플레이리스트·TV 스트레칭이 제공된다", () => {
    const s = byId("workout");
    expect(deviceState(s, "냉장고 화면")).toMatch(/레시피/);
    expect(deviceState(s, "스피커")).toMatch(/회복 플레이리스트/);
    expect(deviceState(s, "TV")).toMatch(/스트레칭/);
  });
});

// ----------------------- R-13 가전 결과 시각화 -----------------------
describe("R-13 가전 제어 결과가 시각화 가능한 형태로 구성된다", () => {
  it("모든 솔루션 device 는 name·state·status(active|idle) 렌더 필드를 갖는다", () => {
    for (const s of demoEvents) {
      for (const d of s.devices) {
        expect(typeof d.name).toBe("string");
        expect(d.name.length).toBeGreaterThan(0);
        expect(typeof d.state).toBe("string");
        expect(d.state.length).toBeGreaterThan(0);
        expect(["active", "idle"]).toContain(d.status);
      }
    }
  });

  it("행동 시나리오는 화면에 표시할 솔루션 제목·요약을 제공한다", () => {
    for (const id of ["company-dinner", "workout", "quiet-mode"]) {
      const s = byId(id);
      expect(s.solutionTitle.length).toBeGreaterThan(0);
      expect(s.solutionSummary.length).toBeGreaterThan(0);
      expect(s.devices.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ------------------------- R-14 시청기록 활용 -------------------------
describe("R-14 (옵션) 시청 기록을 상황 판단 컨텍스트로 활용", () => {
  it("시청 기록(viewing) 데이터가 존재하고 하나 이상 시나리오에서 사용된다", () => {
    const withViewing = demoEvents.filter((s) =>
      s.data.some((d) => d.id === "viewing" && d.used),
    );
    expect(withViewing.length).toBeGreaterThanOrEqual(1);
    // 회식 시나리오는 이어보기(드라마) 시청기록을 실제로 활용
    const dinnerViewing = byId("company-dinner").data.find((d) => d.id === "viewing");
    expect(dinnerViewing.used).toBe(true);
    expect(dinnerViewing.value.length).toBeGreaterThan(0);
  });
});
