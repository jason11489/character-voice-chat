# 캐릭터 음성 채팅 (Character Voice Chat)

3D 캐릭터와 **음성으로 대화**하는 앱. 글자 생성(LLM)은 외부 서버에서, 음성 합성(TTS)은 맥에서 처리한다.

## 서버 3개만 기억하면 된다

| # | 역할 | 무엇 | 주소 |
|---|------|------|------|
| ① | **LLM** (글자 생성) | 외부 서버 (라즈베리파이 등). 이미 떠 있다고 가정 | `http://<LLM_IP>:9999` |
| ② | **TTS** (음성 합성) | 맥의 `tts-server/macos-tts-server.py` | `http://localhost:8080` |
| ③ | **화면** (프론트) | `virtual-avatar/` (Vite + React + Three.js) | `http://localhost:5173` |

흐름: `[브라우저 ③]` → LLM ① 에서 글자 스트리밍 → 문장 단위로 TTS ② 호출 → 음성 재생.

---

## 빠른 시작 (평소 실행)

설치가 한 번 끝났다면, 터미널 2개만 띄우면 된다. (LLM ① 은 외부 서버라 별도)

**터미널 A — TTS 서버 ②**

```bash
./run-tts.sh        # = melo 백엔드로 :8080 실행
```

**터미널 B — 프론트 ③**

```bash
cd virtual-avatar
npm run dev          # http://localhost:5173
```

브라우저에서 **http://localhost:5173** 접속. 끝.

> 같은 WiFi의 폰/PC에서 보려면 `http://<맥IP>:5173` (맥 IP: `ipconfig getifaddr en0`).
> 전부 **http(LAN)** 로 통일할 것 — https로 열면 Mixed Content로 http 호출이 막힌다.

### LLM·TTS 주소 바꾸기

프론트가 바라보는 주소는 `virtual-avatar/.env` 에 있다 (`.env.example` 복사해서 사용).

```env
VITE_PI_API_BASE=http://10.56.130.224:9999   # LLM ① 주소
VITE_TTS_API_BASE=http://localhost:8080       # TTS ② 주소
```

---

## 최초 1회 설치

### 프론트 ③

```bash
cd virtual-avatar
npm install
cp .env.example .env      # 그리고 .env 에서 LLM 주소를 본인 환경에 맞게 수정
```

### TTS ② (melo 백엔드)

```bash
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install -r tts-server/requirements-melo.txt
tts-server/venv/bin/python -m unidic download   # 일본어 사전 (import 의존성)
sh tts-server/patch-melo-macos.sh               # macOS 대소문자 충돌 패치
```

> **왜 패치가 필요한가**: 대소문자 비구분 파일시스템에서 일본어 `MeCab` 과 한국어 `mecab` 패키지가
> 충돌한다. 패치는 melo를 한국어 전용으로 바꿔 이 충돌을 피한다. (Apple Silicon은 MPS로 문장당 ~1초)

melo는 기본적으로 `voice/티모 2024 한국어 음성 ...mp3` 를 OpenVoiceV2 레퍼런스 음색으로 사용한다.

---

## 더 알아보기

- **다른 TTS 백엔드** (`say` 무설치 / `qwen` 로컬추론) 와 OpenVoice 음색 변환 옵션 → [`tts-server/`](tts-server/) 참고.
- **단일 HTML 버전**: 프론트 대신 가벼운 `chat-ui.html` 도 있다. TTS 서버에 `--serve-dir .` 를 붙여 실행하면
  `http://localhost:8080/chat-ui.html` 로 바로 열린다.
- **프론트 상세** (SSE 스트리밍, 입싱크, 문장 prefetch, VRM 모델) → [`virtual-avatar/README.md`](virtual-avatar/README.md)

## 라이선스 / 참고

- MeloTTS: https://github.com/myshell-ai/MeloTTS
- OpenVoiceV2: https://github.com/myshell-ai/OpenVoice (MIT)
- Qwen3-TTS: https://github.com/QwenLM/Qwen3-TTS (Apache 2.0)
</content>
</invoke>
