# 캐릭터 음성 채팅 (Character Voice Chat)

브라우저에서 캐릭터(EMO 스타일 SVG 로봇)와 **음성으로 대화**하는 채팅 UI.
글자 생성(LLM 추론)은 별도 서버에, 음성 합성(TTS)은 맥에서 처리한다.

```
[브라우저] --(페이지 + TTS, 같은 오리진)--> [맥 TTS 서버 :8080]
     \------(LLM 토큰 스트리밍, SSE)--------> [LLM API :9999]
```

## 구성

- **`chat-ui.html`** — 정적 채팅 페이지. 토큰 SSE 스트리밍, 캐릭터 애니메이션(눈 깜빡임/입 모션),
  문장 단위 분할, 서버 오디오 재생 파이프라인(순서 보장 + prefetch), **실제 음량(RMS) 기반 입싱크**,
  캐릭터 페르소나(시스템 프롬프트) 편집 UI 포함.
- **`virtual-avatar/`** — Vite + React + Three.js 기반 3D 홈솔루션비서 데모 프론트.
  좌측에는 캘린더/개인 데이터/가전 실행 상태를 보여주고, 우측에는 3D 캐릭터가 말풍선과 입 모션으로 응답한다.
- **`tts-server/macos-tts-server.py`** — 맥용 TTS HTTP 서버. 정적 파일 서빙(`--serve-dir`) +
  `GET /tts` 로 WAV 반환. 백엔드 2종:
  - `say` (기본, 설치 0) — macOS 내장 음성. UI에서 한국어 음성 선택 가능.
  - `melo` — MeloTTS(한국어 신경망 TTS). 더 자연스러움. venv 필요.

## 실행

### 1) say 백엔드 (가장 간단, 설치 불필요)

```bash
python3 tts-server/macos-tts-server.py --backend say --voice Yuna --port 8080 --serve-dir .
```

### 1-1) 3D 홈솔루션비서 프론트

```bash
cd virtual-avatar
npm install
npm run dev
```

접속: `http://localhost:5173/`

### 2) melo 백엔드 (더 자연스러운 음성)

```bash
# 최초 1회: venv 구성
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install -r tts-server/requirements-melo.txt
sh tts-server/patch-melo-macos.sh

# 실행 (반드시 venv 파이썬으로)
tts-server/venv/bin/python tts-server/macos-tts-server.py --backend melo --port 8080 --serve-dir .
```

> **macOS 함정**: 대소문자 비구분 파일시스템에서 일본어 `MeCab`과 한국어 `mecab`이 충돌합니다.
> `patch-melo-macos.sh`는 한국어 전용 실행을 위해 일본어 모듈의 자동 import만 제외합니다.
>
> Melo 백엔드의 기본 음색은
> `voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`입니다.

#### melo + OpenVoiceV2 음색 변환 (선택)

melo(한국어 화자 1명 고정)의 출력을 레퍼런스 화자의 음색으로 변환한다.

```bash
# 최초 1회: OpenVoice repo + 체크포인트 (tts-server/ 아래, gitignore)
git clone --depth 1 https://github.com/myshell-ai/OpenVoice.git tts-server/openvoice-src
tts-server/venv/bin/python -m pip install --no-deps wavmark==0.0.3
mkdir -p tts-server/checkpoints_v2/converter tts-server/checkpoints_v2/base_speakers/ses
base=https://huggingface.co/myshell-ai/OpenVoiceV2/resolve/main
for f in converter/config.json converter/checkpoint.pth base_speakers/ses/kr.pth; do
  curl -sL -o "tts-server/checkpoints_v2/$f" "$base/$f"; done

# 다른 음색을 기본으로 지정할 때
tts-server/venv/bin/python tts-server/macos-tts-server.py --backend melo \
  --voice-convert "voice/스파이패밀리 아냐 목소리 대사 모음.mp3" \
  --port 8080 --serve-dir .
```

> 소스 SE 는 `kr.pth`, 타겟 SE 는 레퍼런스에서 추출(whisper 불필요). 변환기는 CPU 사용.
> 문장당 melo(~0.5s) + 변환(~1.2s) 정도. 본인 목소리로 바꾸려면 `--voice-convert <녹음.wav>`.

### 접속

- 같은 맥: `http://localhost:8080/chat-ui.html`
- 같은 WiFi의 폰/PC: `http://<맥IP>:8080/chat-ui.html` (맥 IP: `ipconfig getifaddr en0`)

페이지 상단 **API 서버 주소**에 LLM 엔드포인트(예: `http://10.56.130.224:9999`)를 입력한다.
페이지와 TTS가 같은 서버라 TTS 쪽 CORS는 신경 쓸 필요 없다. **전부 http(LAN)** 로 통일할 것
(https로 열면 Mixed Content로 http 호출이 막힘).

## 설정 (페이지 좌측 패널)

- **🎭 캐릭터 설정** — 캐릭터 성격/말투(시스템 프롬프트). 기본값은 발랄한 로봇 '루미'.
- **🔊 TTS** — 서버 / 브라우저 내장(폴백) / 끄기.
- **음성** — say 백엔드일 때 한국어 음성 선택(다운로드된 음성만 작동).
- **속도/높이** — 재생 속도, (브라우저 폴백용) 피치.

## 라이선스 / 참고

- MeloTTS: https://github.com/myshell-ai/MeloTTS
- OpenVoiceV2: https://github.com/myshell-ai/OpenVoice (MIT)
