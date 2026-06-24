# 캐릭터 음성 채팅 (Character Voice Chat)

3D 캐릭터와 음성으로 대화하는 앱입니다. 글자 생성(LLM)은 외부 서버에서,
음성 합성(TTS)은 맥에서 처리합니다.

## 서버 3개

| 역할 | 서버 | 주소 |
|---|---|---|
| LLM | 외부 서버 또는 라즈베리파이 | `http://<LLM_IP>:9999` |
| TTS | `tts-server/macos-tts-server.py` | `http://localhost:8080` |
| 프론트 | `virtual-avatar/` | `http://localhost:5173` |

흐름: 브라우저에서 LLM 응답을 스트리밍으로 받고, 완성된 문장부터 TTS 서버에
전달해 순서대로 재생합니다.

## 빠른 시작

설치가 끝난 환경에서는 터미널 두 개를 사용합니다.

터미널 A:

```bash
./run-tts.sh
```

터미널 B:

```bash
cd virtual-avatar
npm run dev
```

브라우저에서 `http://localhost:5173`에 접속합니다.

같은 Wi-Fi의 다른 기기에서는 `http://<맥IP>:5173`으로 접속할 수 있습니다.
LLM과 TTS가 HTTP이므로 프론트도 HTTP로 실행해야 합니다.

### 서버 주소

`virtual-avatar/.env`:

```env
VITE_PI_API_BASE=http://10.56.130.224:9999
VITE_TTS_API_BASE=http://localhost:8080
```

## 최초 설치

### 프론트

```bash
cd virtual-avatar
npm install
cp .env.example .env
```

### TTS

Python 3.11 환경을 사용합니다.

```bash
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install -r tts-server/requirements-melo.txt
sh tts-server/patch-melo-macos.sh
```

macOS의 대소문자 비구분 파일시스템에서는 일본어 `MeCab`과 한국어 `mecab`
패키지가 충돌합니다. `patch-melo-macos.sh`는 MeloTTS를 한국어 전용으로
패치하고 한국어 MeCab을 다시 설치합니다.

## TTS 동작

- 기본 백엔드: MeloTTS 한국어 모델
- 기본 음색: `voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`
- 음색 변환: OpenVoiceV2
- API: `GET /tts?text=...&rate=1.0`
- 캐시: 서버에서 최근 64개 문장의 WAV를 메모리에 보관
- 프론트: 고정 문구를 백그라운드에서 미리 합성하고 브라우저 메모리에도 캐시

다른 음색을 기본으로 지정하려면:

```bash
tts-server/venv/bin/python tts-server/macos-tts-server.py \
  --backend melo \
  --voice-convert "voice/스파이패밀리 아냐 목소리 대사 모음.mp3" \
  --port 8080 \
  --serve-dir .
```

`say` 백엔드로 실행하려면:

```bash
./run-tts.sh --backend say --voice Yuna
```

## 추가 정보

- 단일 HTML 버전은 `chat-ui.html`입니다.
- TTS 서버에 `--serve-dir .`를 사용하면 `http://localhost:8080/chat-ui.html`로
  접속할 수 있습니다.
- 프론트의 SSE 스트리밍과 TTS 큐 동작은
  [`virtual-avatar/README.md`](virtual-avatar/README.md)를 참고하세요.

## 라이선스

- MeloTTS: https://github.com/myshell-ai/MeloTTS
- OpenVoiceV2: https://github.com/myshell-ai/OpenVoice (MIT)
