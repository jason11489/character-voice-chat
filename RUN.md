# RUN.md — 설치 · 실행 · 테스트

프로그램별 설치/실행 방법과 환경 변수, 외부 자원, 연동 순서를 정리합니다.
개요·구조는 [`README.md`](README.md), 요구사항은 [`요구사항_명세서.md`](요구사항_명세서.md) 참조.

## 구성 요약

| 프로그램 | 실행 위치 | 기본 주소 |
|---|---|---|
| backend (STT+TTS+UI 서빙) | 노트북 또는 라즈베리파이 | `http://<HOST>:8080` |
| frontend (Vite) | 개발 시 별도, 배포 시 backend 가 서빙 | `http://<HOST>:5173` (dev) |
| distributed-llama (LLM) | **별도 라즈베리파이 4노드 클러스터** | `http://<LLM_IP>:9999` |
| device (LED 제어) | **LED 가 연결된 라즈베리파이** | `http://<LED_IP>:5000` |

> ⚠️ **LLM 클러스터(distributed-llama)와 LED 서버는 별도 노드에서 구동**됩니다.
> 이 저장소 호스트에서 직접 기동하지 않으며, frontend 는 `.env` 의 주소로 원격 호출합니다.
> (아래 각 항목에 노드에서의 기동 방법을 함께 기재)

## 사전 준비

- macOS 또는 라즈베리파이(ARM 리눅스)
- Node.js 18+
- Python 3.11
- git 서브모듈 초기화:

```bash
git submodule update --init --recursive
```

---

## 1. backend (STT + TTS + UI 서빙)

경로: `src/program_backend/`

### 1-1. Python 환경

```bash
cd src/program_backend
python3.11 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements-melo.txt   # TTS(MeloTTS)
venv/bin/pip install -r requirements-stt.txt    # STT(faster-whisper)
```

macOS 는 한국어 `mecab` 충돌 패치를 추가로 실행합니다:

```bash
venv/bin/pip uninstall -y mecab-python3
venv/bin/pip install --force-reinstall --no-deps python-mecab-ko python-mecab-ko-dic
```

### 1-2. 모델 다운로드

MeloTTS·OpenVoiceV2 체크포인트는 용량 때문에 git 에 없습니다:

```bash
sh src/program_backend/fetch-models.sh
```

기본 음색 레퍼런스: `src/program_backend/voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`

### 1-3. 실행

프론트를 빌드(§2-2)한 뒤, 한 프로세스가 STT·TTS·UI 를 `:8080` 에서 서빙합니다:

```bash
./run-tts.sh                 # 기본: melo 백엔드, 포트 8080, 프론트 dist 서빙
./run-tts.sh --profile laptop   # 맥북: STT small 모델 + 전체 코어
```

`run-tts.sh` 는 내부적으로 다음을 실행합니다:

```bash
src/program_backend/venv/bin/python src/program_backend/macos-tts-server.py \
  --backend melo --port 8080 --serve-dir src/program_frontend/dist
```

| 프로파일 | STT 모델 | CPU 스레드 | 용도 |
|---|---|---|---|
| `pi` (기본) | `tiny` | 2 | 라즈베리파이(4코어) |
| `laptop` | `small` | 전체 코어 | 맥북 등 |

> 라즈베리파이는 스레드를 코어 수만큼 늘리면 busy-wait 로 오히려 느려져 2로 고정합니다(측정 결과).
> `OMP_WAIT_POLICY=passive` 는 서버가 자동 설정합니다.

API: `GET /health`, `GET /voices`, `GET /tts?text=...&rate=1.0`, `POST /stt`

> **마이크(STT)** 는 보안 컨텍스트가 필요합니다. `localhost` 는 예외라 http 로도 되지만,
> 다른 기기에서 `http://<IP>:8080` 으로 열면 마이크가 막힙니다 → **서버 본체의 로컬 브라우저**로 여세요.

---

## 2. frontend (Vite)

경로: `src/program_frontend/`

### 2-1. 설치 · 환경 변수

```bash
cd src/program_frontend
npm install
cp .env.example .env
```

`.env` (실제 주소로 수정):

```env
VITE_PI_API_BASE=http://<LLM_IP>:9999     # distributed-llama (LLM) 클러스터 주소
VITE_LLM_MODEL=distributed-llama          # LLM 서버가 받는 모델 이름
VITE_LLM_STREAM=true                      # 스트리밍 사용
VITE_TTS_API_BASE=http://localhost:8080   # TTS 서버 (통합 배포면 비워둠 → 호스트:8080 자동탐색)
VITE_PI_LED_BASE=http://<LED_IP>:5000     # LED 라즈베리파이 주소
```

### 2-2. 빌드(배포) / 개발

```bash
npm run build       # 배포용: dist/ 생성 → backend 가 서빙(§1-3)
npm run dev         # 개발용: http://localhost:5173 (backend 와 별도 기동)
```

---

## 3. device (LED 제어) — 별도 노드

경로: `src/program_device/led_bridge.py` · 의존성: `requests`

**LED 가 연결된 라즈베리파이**에서 실행되며, LLM 홈솔루션(`homeSolution.devices`)을
받아 6개 물리 LED(A~F)를 on/off 합니다. 대상 Pi 주소는 파일 상단 `LED_PI_URL`
(기본 `http://10.56.131.40:5000/led`) 및 frontend `.env` 의 `VITE_PI_LED_BASE` 로 지정합니다.

```bash
pip install requests
python3 src/program_device/led_bridge.py   # 데모 페이로드로 연결 확인
```

> ⚠️ 이 저장소 호스트에는 LED 하드웨어가 없어 직접 기동하지 않습니다. 실제 제어는 LED 노드에서 수행됩니다.

---

## 4. distributed-llama (LLM) — 별도 4노드 클러스터

경로: `src/program_backend/distributed-llama/` (git 서브모듈)

**하드웨어 구성**: 라즈베리파이 5(8GB) **4대**(루트 1 + 워커 3)를 **1Gb 스위치 허브**로 연결.
**모델**: Qwen3-30B-A3B q40 을 4대 텐서 병렬로 완전 로컬 추론.
OpenAI 호환 API 를 루트 노드 `:9999` 로 제공하며, frontend 가 `POST /v1/chat/completions` 로 호출합니다.

참고: [distributed-llama HOW_TO_RUN_RASPBERRYPI](https://github.com/b4rtaz/distributed-llama/blob/main/docs/HOW_TO_RUN_RASPBERRYPI.md)

### 4-1. 빌드 (전 노드)

```bash
cd src/program_backend/distributed-llama
make dllama
make dllama-api
```

### 4-2. 워커 노드 3대 기동 (각 워커에서)

```bash
sudo nice -n -20 ./dllama worker --port 9999 --nthreads 4
```

### 4-3. 루트 노드에서 API 서버 기동

```bash
sudo nice -n -20 ./dllama-api \
  --host 0.0.0.0 --port 9999 \
  --model models/qwen3_30b_a3b_q40/dllama_model_qwen3_30b_a3b_q40.m \
  --tokenizer models/qwen3_30b_a3b_q40/dllama_tokenizer_qwen3_30b_a3b_q40.t \
  --buffer-float-type q80 \
  --nthreads 4 \
  --max-seq-len 4096 \
  --workers <WORKER1_IP>:9999 <WORKER2_IP>:9999 <WORKER3_IP>:9999
```

- `--workers` : 워커 3대의 `IP:포트` 를 공백으로 나열 (스위치 허브 내부 IP)
- `--nthreads 4` : Pi5 4코어
- 모델/토크나이저 경로(`.m`/`.t`)는 변환된 Qwen3-30B-A3B q40 파일명에 맞춥니다

> ⚠️ 클러스터 노드에서 구동되며, 이 저장소 호스트에서 직접 켜지 않습니다.
> frontend 의 `.env` `VITE_PI_API_BASE` 를 루트 노드 `http://<ROOT_IP>:9999` 로 지정하세요.

---

## 연동 순서

1. (별도 노드) distributed-llama 클러스터 기동 → `:9999`
2. (별도 노드) LED 라즈베리파이 `led_bridge` / LED 서버 기동 → `:5000`
3. frontend 빌드 (`npm run build`)
4. backend 기동 (`./run-tts.sh`) → `http://<HOST>:8080/`
5. `.env` 의 `VITE_PI_API_BASE`(LLM), `VITE_PI_LED_BASE`(LED) 가 위 노드를 가리키는지 확인

---

## 테스트 실행

요구사항 ID(`R-0x`)가 테스트 이름/주석에 매핑되어 있으며, 결과는 `test-results/` 에 JUnit XML 로 저장됩니다.

### backend · device (pytest)

```bash
python3 -m venv .testenv && .testenv/bin/pip install pytest requests
.testenv/bin/python -m pytest tests/program_backend  --junitxml=test-results/program_backend/junit.xml
.testenv/bin/python -m pytest tests/program_device   --junitxml=test-results/program_device/junit.xml
```

> 무거운 모델(MeloTTS/faster-whisper)과 Pi 호출은 mock 하므로, 테스트에는 모델·하드웨어가 필요 없습니다.

### frontend (Vitest)

```bash
cd src/program_frontend
npm install          # 최초 1회 (vitest, jsdom 포함)
npm test             # → test-results/program_frontend/junit.xml
```
