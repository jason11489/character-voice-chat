# 캐릭터 음성 채팅

3D 캐릭터와 음성으로 대화하는 앱입니다. 실행 방식은 두 가지입니다.

**개발(맥)**: 프론트와 TTS를 따로 띄웁니다.

| 역할 | 서버 | 기본 주소 |
|---|---|---|
| LLM | 외부 서버 또는 라즈베리파이 | `http://<LLM_IP>:9999` |
| TTS+STT | `tts-server/macos-tts-server.py` | `http://localhost:8080` |
| 프론트 | `virtual-avatar/` Vite 개발 서버 | `http://localhost:5173` |

**통합(배포, 라즈베리파이)**: TTS 서버 한 프로세스가 STT·TTS·UI를 모두 `:8080`에서 서빙합니다.
LLM만 외부 박스에 둡니다. ([통합 실행](#통합-실행-배포-한-서버로-sttttsui) 참고)

브라우저는 LLM에 `POST /v1/chat/completions`로 연결하고, 완성된 문장부터
TTS 서버에 보내 순서대로 재생합니다. 마이크 입력은 `POST /stt`로 텍스트로 변환합니다.

## 처음 받은 사람용 셋업

### 1. 사전 준비

- macOS
- Node.js 18 이상
- Python 3.11
- 라즈베리파이 또는 다른 LLM HTTP 서버 주소

확인 명령:

```bash
node -v
python3.11 --version
```

### 2. 프론트 설치

```bash
cd virtual-avatar
npm install
cp .env.example .env
```

`virtual-avatar/.env`를 열어서 실제 서버 주소로 수정합니다.

```env
VITE_PI_API_BASE=http://10.56.130.224:9999
VITE_LLM_MODEL=distributed-llama
VITE_LLM_STREAM=true
VITE_TTS_API_BASE=http://localhost:8080
```

설명:

- `VITE_PI_API_BASE`: 라즈베리파이 LLM 주소
- `VITE_LLM_MODEL`: LLM 서버가 받는 모델 이름
- `VITE_LLM_STREAM`: 스트리밍 사용 여부
- `VITE_TTS_API_BASE`: 현재 맥에서 띄울 TTS 서버 주소

### 3. TTS Python venv 생성

루트에서 실행합니다.

```bash
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install --upgrade pip
tts-server/venv/bin/pip install -r tts-server/requirements-melo.txt
sh tts-server/patch-melo-macos.sh
```

`patch-melo-macos.sh`는 macOS에서 한국어 `mecab` 충돌을 피하기 위한 패치입니다.

### 4. TTS 모델/레퍼런스 확인

현재 기본 음성 레퍼런스는 아래 파일입니다.

`voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`

기본 실행은 MeloTTS + OpenVoiceV2 음색 변환 기준입니다. 첫 실행 전에 관련 모델이
로컬에 준비되어 있어야 합니다. OpenVoice 소스/체크포인트와 MeloTTS 모델은 git에 포함되지 않으니
(용량 문제) venv 설치 후 아래 스크립트로 받습니다.

```bash
sh tts-server/fetch-models.sh
```

### 5. 실행

터미널 1:

```bash
./run-tts.sh
```

터미널 2:

```bash
cd virtual-avatar
npm run dev
```

브라우저:

```text
http://localhost:5173
```

같은 Wi-Fi의 다른 기기에서는 `http://<맥IP>:5173`으로 접속할 수 있습니다.

## 실행 순서 체크리스트

1. `virtual-avatar/.env`에 LLM 주소 입력
2. `tts-server/venv` 생성 및 의존성 설치
3. `./run-tts.sh`로 TTS 실행
4. `cd virtual-avatar && npm run dev`
5. 브라우저에서 `http://localhost:5173` 접속

## 통합 실행 (배포: 한 서버로 STT+TTS+UI)

라즈베리파이 등에 배포할 때는 프론트를 빌드해서 TTS 서버가 함께 서빙합니다.
한 프로세스가 `:8080`에서 UI·TTS·STT를 모두 처리하므로 같은 오리진이라 CORS/HTTPS 설정이 없어도 됩니다.

```bash
# 1) 프론트 빌드 (UI 코드 바뀔 때마다 다시)
cd virtual-avatar && npm run build

# 2) TTS 서버가 빌드 결과까지 서빙 (한 줄로 STT+TTS+UI 기동)
cd ..
tts-server/venv/bin/python tts-server/macos-tts-server.py \
  --backend melo \
  --serve-dir virtual-avatar/dist \
  --port 8080
```

브라우저로 `http://localhost:8080/` 접속. 마이크(STT)는 보안 컨텍스트가 필요한데
`localhost`는 예외라 http로도 동작합니다. (다른 기기에서 `http://<IP>:8080`으로 열면 마이크가 막히니 키오스크는 그 기기의 로컬 브라우저로 띄우세요.)

주의: 프론트의 TTS 주소 자동탐색이 `<호스트>:8080`을 쓰므로 **포트는 8080으로 고정**합니다.
`virtual-avatar/.env`의 `VITE_TTS_API_BASE`는 비워두고, `VITE_PI_API_BASE`만 외부 LLM 주소로 둡니다.

라즈베리파이(ARM 리눅스) 셋업은 `PI-HANDOFF.md` 참고.

## 머신별 실행 (라즈베리파이 vs 맥북)

STT 모델·CPU 스레드 수를 머신에 맞춰 `--profile` 한 줄로 분리합니다.
명시 인자(`--stt-model`, `--cpu-threads`)를 주면 프로파일 값을 덮어씁니다.

| 프로파일 | STT 모델 | CPU 스레드 | 용도 |
|----------|----------|-----------|------|
| `pi` (기본) | `tiny` | 2 | 라즈베리파이(4코어). 가볍고 빠름 |
| `laptop` | `small` | 전체 코어 | 맥북 등. 더 정확한 인식 |

> 참고: 라즈베리파이에선 스레드를 코어 수만큼 늘리면 busy-wait 로 오히려 느려져서 2로 고정합니다(측정 결과). `OMP_WAIT_POLICY=passive` 도 서버가 자동 설정합니다.

### 라즈베리파이 (경량)

venv 는 루트 `.venv`. `--profile pi` 가 기본이라 생략해도 `tiny` 로 뜹니다.

```bash
cd ~/character-voice-chat
.venv/bin/python tts-server/macos-tts-server.py \
  --backend melo \
  --serve-dir virtual-avatar/dist \
  --port 8080
```

마이크(STT)는 보안 컨텍스트가 필요하므로 **파이 본체의 로컬 브라우저**로 `http://localhost:8080/` 을 띄우세요(원격 기기에서 `http://<IP>:8080` 으로 열면 마이크가 막힘).

### 맥북 (조금 더 좋은 모델)

venv 는 루트 `.venv`. `--profile laptop` 으로 `small` + 전체 코어를 씁니다.

```bash
cd ~/character-voice-chat
.venv/bin/python tts-server/macos-tts-server.py \
  --profile laptop \
  --backend melo \
  --serve-dir virtual-avatar/dist \
  --port 8080
```

> STT 모델은 첫 실행 시 자동 다운로드됩니다. 오프라인 환경이면 `tts-server/fetch-models.sh` 로 미리 받아두세요.

## 자주 헷갈리는 부분

### `venv`는 무엇을 쓰나

- 실제 사용 중인 Python 가상환경: `tts-server/venv`
- 실행 파일: `tts-server/venv/bin/python`
- 편의 실행 스크립트: `./run-tts.sh`

### `pi-llm-server`도 실행해야 하나

현재 이 레포에서 실제로 쓰는 LLM 경로는 `virtual-avatar/.env`의
`VITE_PI_API_BASE`입니다. 즉, 프론트는 지정한 외부 HTTP LLM 서버에 직접 붙습니다.

`pi-llm-server/` 폴더는 지금 기준으로 실행 엔트리 파일이 없고 `.env`, `.venv`만 남아
있어서, 처음 받은 사람은 셋업 대상에서 제외해도 됩니다.

## TTS 동작 요약

- 기본 백엔드: `melo`
- 기본 음색: `Teemo` 샘플
- 음색 변환: `OpenVoiceV2`
- API: `GET /health`, `GET /tts?text=...&rate=1.0`
- 서버 캐시: 최근 64개 문장 WAV
- 프론트 캐시: 자주 쓰는 문장 Blob 캐시

다른 레퍼런스 음성으로 바꾸려면:

```bash
tts-server/venv/bin/python tts-server/macos-tts-server.py \
  --backend melo \
  --voice-convert "voice/스파이패밀리 아냐 목소리 대사 모음.mp3" \
  --port 8080 \
  --serve-dir virtual-avatar/dist
```

macOS 기본 `say` 백엔드로 확인만 빠르게 하려면:

```bash
./run-tts.sh --backend say --voice Yuna
```

## 참고

- TTS 서버에 `--serve-dir virtual-avatar/dist`를 주면 `http://localhost:8080/`에서 UI를 함께 서빙합니다(통합 실행).
- 레거시 단일 HTML 버전 `chat-ui.html`도 있지만 현재 프론트는 `virtual-avatar/`입니다.
- 프론트 스트리밍/TTS 큐 설명은 `virtual-avatar/README.md`에 있습니다.
