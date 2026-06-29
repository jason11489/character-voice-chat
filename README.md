# 캐릭터 음성 채팅

3D 캐릭터와 음성으로 대화하는 앱입니다.

- **STT** (마이크 → 텍스트): faster-whisper
- **LLM** (텍스트 → 답변): 외부 HTTP 서버 (라즈베리파이 등)
- **TTS** (답변 → 음성): MeloTTS + OpenVoiceV2 음색 변환

브라우저가 LLM에 `POST /v1/chat/completions`로 연결하고, 완성된 문장부터 TTS 서버로
보내 순서대로 재생합니다. 마이크 입력은 `POST /stt`로 텍스트로 변환합니다.

## 구성

| 역할 | 서버 | 기본 주소 |
|---|---|---|
| LLM | 외부 서버 / 라즈베리파이 | `http://<LLM_IP>:9999` |
| TTS + STT | `tts-server/macos-tts-server.py` | `http://localhost:8080` |
| 프론트 | `virtual-avatar/` (Vite) | `http://localhost:5173` |

실행 방식은 두 가지입니다.

- **개발**: 프론트(Vite)와 TTS 서버를 따로 띄움 → [실행 A](#실행-a-개발-프론트--tts-분리)
- **통합/배포**: TTS 서버 한 프로세스가 STT·TTS·UI를 모두 `:8080`에서 서빙 → [실행 B](#실행-b-통합-한-서버--권장)

---

## 설치 (최초 1회)

### 1. 사전 준비

- macOS 또는 라즈베리파이(ARM 리눅스)
- Node.js 18 이상
- Python 3.11
- LLM HTTP 서버 주소 (라즈베리파이 등)

```bash
node -v
python3.11 --version
```

### 2. 프론트

```bash
cd virtual-avatar
npm install
cp .env.example .env
```

`virtual-avatar/.env`를 실제 주소로 수정합니다.

```env
VITE_PI_API_BASE=http://10.56.130.224:9999   # LLM 주소
VITE_LLM_MODEL=distributed-llama             # LLM 서버가 받는 모델 이름
VITE_LLM_STREAM=true                         # 스트리밍 사용
VITE_TTS_API_BASE=http://localhost:8080      # TTS 서버 (통합 실행이면 비워둠)
```

### 3. Python 환경 (`.venv`)

루트에서 실행합니다. **TTS(melo)와 STT(faster-whisper) 둘 다** 설치해야 합니다.

```bash
python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r tts-server/requirements-melo.txt   # TTS
.venv/bin/pip install -r tts-server/requirements-stt.txt    # STT
```

macOS는 한국어 `mecab` 충돌 패치를 추가로 실행합니다.

```bash
.venv/bin/pip uninstall -y mecab-python3
.venv/bin/pip install --force-reinstall --no-deps python-mecab-ko python-mecab-ko-dic
```

### 4. 모델 받기

MeloTTS·OpenVoice 모델과 체크포인트는 용량 때문에 git에 없습니다. 활성화된 `.venv`로 받습니다.

```bash
source .venv/bin/activate
sh tts-server/fetch-models.sh
```

기본 음색 레퍼런스: `voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`

---

## 실행 A: 개발 (프론트 + TTS 분리)

터미널 2개를 씁니다.

```bash
# 터미널 1 — TTS 서버
.venv/bin/python tts-server/macos-tts-server.py \
  --backend melo --serve-dir virtual-avatar/dist --port 8080

# 터미널 2 — 프론트(Vite)
cd virtual-avatar && npm run dev
```

브라우저: `http://localhost:5173` (같은 Wi-Fi의 다른 기기는 `http://<맥IP>:5173`)

## 실행 B: 통합 (한 서버) — 권장

프론트를 빌드하면 TTS 서버가 UI까지 같은 `:8080`에서 서빙합니다. 같은 오리진이라
CORS/HTTPS 설정이 필요 없습니다.

```bash
# 1) 프론트 빌드 (UI 코드 바뀔 때마다)
cd virtual-avatar && npm run build && cd ..

# 2) 한 줄로 STT + TTS + UI 기동
.venv/bin/python tts-server/macos-tts-server.py \
  --backend melo --serve-dir virtual-avatar/dist --port 8080
```

브라우저: `http://localhost:8080/`

> **마이크(STT)** 는 보안 컨텍스트가 필요합니다. `localhost`는 예외라 http로도 되지만,
> 다른 기기에서 `http://<IP>:8080`으로 열면 마이크가 막힙니다 → **서버 본체의 로컬 브라우저**로 띄우세요.
>
> **포트는 8080 고정.** 프론트가 TTS 주소를 `<호스트>:8080`으로 자동탐색하므로,
> `.env`의 `VITE_TTS_API_BASE`는 비워두고 `VITE_PI_API_BASE`(LLM)만 채웁니다.

### 머신별 프로파일

`--profile` 한 줄로 STT 모델·CPU 스레드 수를 머신에 맞춰 분리합니다.
(`--stt-model`, `--cpu-threads`를 직접 주면 덮어씀)

| 프로파일 | STT 모델 | CPU 스레드 | 용도 |
|---|---|---|---|
| `pi` (기본) | `tiny` | 2 | 라즈베리파이(4코어). 가볍고 빠름 |
| `laptop` | `small` | 전체 코어 | 맥북 등. 더 정확한 인식 |

```bash
# 라즈베리파이 — --profile pi 가 기본이라 생략 가능
.venv/bin/python tts-server/macos-tts-server.py \
  --backend melo --serve-dir virtual-avatar/dist --port 8080

# 맥북
.venv/bin/python tts-server/macos-tts-server.py \
  --profile laptop --backend melo --serve-dir virtual-avatar/dist --port 8080
```

> 라즈베리파이는 스레드를 코어 수만큼 늘리면 busy-wait로 오히려 느려져 2로 고정합니다(측정 결과).
> `OMP_WAIT_POLICY=passive`도 서버가 자동 설정합니다.

---

## 옵션

다른 레퍼런스 음성으로 바꾸기:

```bash
.venv/bin/python tts-server/macos-tts-server.py \
  --backend melo --serve-dir virtual-avatar/dist --port 8080 \
  --voice-convert "voice/스파이패밀리 아냐 목소리 대사 모음.mp3"
```

음색 변환 없이(빠름) macOS 기본 음성으로 확인만:

```bash
.venv/bin/python tts-server/macos-tts-server.py --backend say --voice Yuna --port 8080
```

## TTS 동작 요약

- 기본 백엔드 `melo`, 기본 음색 `Teemo` 샘플, 음색 변환 `OpenVoiceV2`
- API: `GET /health`, `GET /tts?text=...&rate=1.0`, `POST /stt`
- 캐시: 서버는 최근 64개 문장 WAV, 프론트는 자주 쓰는 문장 Blob

## 자주 헷갈리는 부분

**venv 경로** — Python 가상환경은 루트 `.venv` 하나로 통일했습니다 (`.venv/bin/python`).
편의 스크립트 `./run-tts.sh`는 옛 `tts-server/venv` 경로를 가정하므로, `.venv` 환경에선
위의 `.venv/bin/python ...` 명령을 직접 쓰세요.

**`pi-llm-server`** — 실행 대상 아님. 프론트는 `.env`의 `VITE_PI_API_BASE`로 외부 LLM에
직접 붙습니다. `pi-llm-server/` 폴더는 엔트리 파일이 없어 셋업에서 제외해도 됩니다.

## 참고

- 라즈베리파이(ARM 리눅스) 상세 셋업: `PI-HANDOFF.md`
- 프론트 스트리밍/TTS 큐 설명: `virtual-avatar/README.md`
- 레거시 단일 HTML `chat-ui.html`도 있지만 현재 프론트는 `virtual-avatar/`입니다.
