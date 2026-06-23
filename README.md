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
- **`tts-server/macos-tts-server.py`** — 맥용 TTS HTTP 서버. 정적 파일 서빙(`--serve-dir`) +
  `GET /tts` 로 WAV 반환. 백엔드 2종:
  - `say` (기본, 설치 0) — macOS 내장 음성. UI에서 한국어 음성 선택 가능.
  - `melo` — MeloTTS(한국어 신경망 TTS). 더 자연스러움. venv 필요.

## 실행

### 1) say 백엔드 (가장 간단, 설치 불필요)

```bash
python3 tts-server/macos-tts-server.py --backend say --voice Yuna --port 8080 --serve-dir .
```

### 2) melo 백엔드 (더 자연스러운 음성)

```bash
# 최초 1회: venv 구성
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install "git+https://github.com/myshell-ai/MeloTTS.git"
tts-server/venv/bin/python -m unidic download           # 일본어 사전(import 의존성)
tts-server/venv/bin/pip install python-mecab-ko          # 한국어 g2p용 MeCab

# 실행 (반드시 venv 파이썬으로)
tts-server/venv/bin/python tts-server/macos-tts-server.py --backend melo --port 8080 --serve-dir .
```

> **macOS 함정**: 대소문자 비구분 파일시스템에서 일본어 `MeCab` 과 한국어 `mecab` 패키지가 충돌한다.
> 한국어만 쓰면 `melo/text/japanese.py` 의 `import MeCab` / `_TAGGER` 를 옵셔널로 패치하고
> `mecab-python3` 대신 `python-mecab-ko` 만 설치하면 된다. (Apple Silicon은 MPS로 문장당 ~1초)

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
