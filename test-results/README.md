# test-results

프로그램별 단위 테스트의 JUnit XML 실행 결과입니다. 재생성 방법은 [`../RUN.md`](../RUN.md#테스트-실행) 참조.

| 프로그램 | 결과 파일 | 프레임워크 | 통과 |
|---|---|---|---|
| frontend | `program_frontend/junit.xml` | Vitest | 13 / 13 |
| backend | `program_backend/junit.xml` | pytest | 12 / 12 |
| device | `program_device/junit.xml` | pytest | 10 / 10 |
| **합계** | | | **35 / 35** |

## 요구사항 커버리지 (테스트로 검증)

| 요구사항 | 테스트 | 프로그램 |
|---|---|---|
| R-01 STT | `test_R01_stt_*` | backend |
| R-02 LLM 통신 | `R-02: OpenAI 호환 엔드포인트로 POST` | frontend |
| R-03 응답 스키마 `{text, homeSolution}` | `R-03 캐릭터 응답 스키마 검증/정규화` | frontend |
| R-05 TTS 합성·음색·상태 | `test_R05_*`, ttsApi `R-05 *` | backend, frontend |
| R-07·R-12 가전 제어(LED) | `test_R12_*`, `R-07/R-12 가전 → LED 제어` | device, frontend |
| R-17 통합 UI 서빙·경로보안 | `test_R17_*` | backend |

> R-04·R-06·R-08~R-11·R-13·R-14·R-16 은 단위 테스트 대상이 아니며 시연영상으로 입증합니다(요구사항 명세서 참조).
