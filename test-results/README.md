# test-results

프로그램별 단위 테스트의 JUnit XML 실행 결과입니다. 재생성 방법은 [`../RUN.md`](../RUN.md#테스트-실행) 참조.

| 프로그램 | 결과 파일 | 프레임워크 | 통과 |
|---|---|---|---|
| frontend | `program_frontend/junit.xml` | Vitest | 27 / 27 |
| backend | `program_backend/junit.xml` | pytest | 12 / 12 |
| device | `program_device/junit.xml` | pytest | 10 / 10 |
| **합계** | | | **49 / 49** |

## 요구사항 커버리지 (테스트로 검증)

| 요구사항 | 테스트 | 프로그램 |
|---|---|---|
| R-01 STT | `test_R01_stt_*` | backend |
| R-02 LLM 통신 | `R-02: OpenAI 호환 엔드포인트로 POST` | frontend |
| R-03 응답 스키마 `{text, homeSolution}` | `R-03 캐릭터 응답 스키마 검증/정규화` | frontend |
| R-05 TTS 합성·음색·상태 | `test_R05_*`, ttsApi `R-05 *` | backend, frontend |
| R-07·R-12 가전 제어(LED) | `test_R12_*`, `R-07/R-12 가전 → LED 제어` | device, frontend |
| R-08 복수 개인데이터 종합 | `R-08 복수 개인 데이터 종합 상황 판단` | frontend |
| R-09 컨텍스트별 차등 동작 | `R-09 같은 발화라도 컨텍스트가 다르면…` | frontend |
| R-10 시나리오①(회식 후) | `R-10 시나리오①(회식 후 귀가) 정의 순서` | frontend |
| R-11 시나리오②(운동 후) | `R-11 시나리오②(운동 후 귀가) 정의 동작` | frontend |
| R-13 가전 결과 시각화 | `R-13 가전 제어 결과가 시각화 가능한…` | frontend |
| R-14 시청기록 활용(옵션) | `R-14 (옵션) 시청 기록을 상황 판단 컨텍스트로…` | frontend |
| R-16 로컬 처리(프라이버시) | `R-16 추론·음성 엔드포인트가 로컬/사설 LAN…` | frontend |
| R-17 통합 UI 서빙·경로보안 | `test_R17_*` | backend |

> R-15(성능)은 단위 테스트 대신 성능 측정 로그로 입증합니다 → [`performance.md`](performance.md) (생성 처리량 10~13 tok/s, 팀 측정).
> R-04(4노드 클러스터 실기동)·R-06(립싱크 시각 동작)은 하드웨어/영상이 필요하여 시연영상 타임스탬프로 입증합니다(요구사항 명세서 참조).
