# 캐릭터 음성 채팅 — TV 기반 IoT 비서 (보스 베이비 / A반 2팀)

사용자의 음성과 개인 데이터(일정·위치·결제·날씨 등)를 종합해 상황을 스스로 파악하고,
격식 있는 "보스" 캐릭터가 가전을 제어하며 정서적으로 교감하는 **로컬 완결형 IoT 비서**입니다.
모든 추론은 라즈베리파이 클러스터에서 로컬로 수행되어 데이터가 외부로 나가지 않습니다.

- **팀원**: 정지운 · 박새란 · 김승우 · 주수원
- **요구사항**: [`요구사항_명세서.md`](요구사항_명세서.md) (R-01 ~ R-17)
- **실행 방법**: [`RUN.md`](RUN.md)

## 동작 흐름

```
사용자 발화 → STT(Whisper) → LLM POST(distributed-llama, OpenAI 호환)
→ {text, homeSolution{devices}} 응답
→ TTS(MeloTTS+OpenVoiceV2) + 3D 캐릭터 립싱크
→ 가전 LED 제어 / 홈솔루션 UI 시각화
```

## 아키텍처 (3 프로그램)

| 프로그램 | 경로 | 역할 | 스택 |
|---|---|---|---|
| **frontend** | `src/program_frontend/` | 3D 캐릭터 UI, STT 녹음, LLM/TTS 호출, 홈솔루션·LED 제어 | React + Vite + Three.js |
| **backend** | `src/program_backend/` | STT·TTS 통합 HTTP 서버, UI 정적 서빙, 로컬 LLM 런타임(distributed-llama) | Python(stdlib http) + MeloTTS + faster-whisper |
| **device** | `src/program_device/` | LLM 홈솔루션을 라즈베리파이 물리 LED on/off 로 시각화 | Python + requests |

> `src/program_backend/distributed-llama` 는 30B 급 모델을 라즈베리파이 4대 텐서 병렬로
> 구동하는 추론 런타임(git 서브모듈)입니다. 빌드·기동은 [`RUN.md`](RUN.md) 참조.

## 디렉토리 구조

```
├── 요구사항_명세서.md          # 요구사항 R-01~R-17
├── README.md                   # (이 문서) 개요·구조
├── RUN.md                      # 설치·실행·환경변수·외부자원
├── run-tts.sh                  # 통합 서버 기동 편의 스크립트
├── src/
│   ├── program_frontend/       # Vite 프론트엔드
│   ├── program_backend/        # STT+TTS 서버 + distributed-llama(서브모듈) + voice/
│   └── program_device/         # led_bridge.py
├── tests/                      # 프로그램별 단위 테스트 (요구사항 ID 주석)
│   ├── program_frontend/       #   Vitest
│   ├── program_backend/        #   pytest
│   └── program_device/         #   pytest
└── test-results/               # 프로그램별 JUnit XML 실행 결과
```

## 테스트 ↔ 요구사항 매핑

테스트 이름·주석에 요구사항 ID(`R-0x`)를 붙여 요구사항↔테스트↔결과를 추적할 수 있습니다.
실행 방법은 [`RUN.md` §테스트](RUN.md#테스트-실행)를, 결과는 `test-results/` 를 참조하세요.

| 요구사항 | 검증 위치 | 프로그램 |
|---|---|---|
| R-01 STT | `POST /stt` 라우트 | backend |
| R-02 LLM 통신 | OpenAI 호환 POST | frontend |
| R-03 응답 스키마 `{text, homeSolution}` | `sanitizeResponse`/`extractJson` | frontend |
| R-05 TTS 합성·음색·상태 | `/tts` `/voices` `/health`, ttsApi | backend, frontend |
| R-07·R-12 가전 제어(LED) | `sendDeviceCommands`, `led_bridge` | frontend, device |
| R-08 복수 개인데이터 종합 | `demoEvents` context 조립, `askPiLLM(context)` | frontend |
| R-09 컨텍스트별 차등 동작 | 동일 발화·상이 context → 상이 요청 | frontend |
| R-10·R-11 시나리오①·② | `demoEvents` 시나리오 정의(순서/동작) | frontend |
| R-13 가전 결과 시각화 | devices name·state·status 렌더 필드 | frontend |
| R-14 시청기록 활용(옵션) | `demoEvents` viewing 데이터 활용 | frontend |
| R-16 로컬 처리(프라이버시) | 엔드포인트 localhost/사설 LAN 한정 | frontend |
| R-17 통합 UI 서빙·경로보안 | 정적 서빙·CORS·traversal 방지 | backend |

> R-04(4노드 TP 실기동)·R-06(립싱크 시각 동작)·R-15(응답시간 실측)은 하드웨어/영상/측정이
> 필요하여 시연영상 타임스탬프 및 성능 측정 로그로 입증합니다(요구사항 명세서 참조).
