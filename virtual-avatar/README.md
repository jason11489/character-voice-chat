# virtual-avatar

노트북에서 실행하는 React + Three.js 3D 캐릭터 앱입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에서 라즈베리파이 LLM 주소와 맥 TTS 서버 주소를 설정하세요.

```env
VITE_PI_API_BASE=http://10.56.130.224:9999
VITE_LLM_MODEL=distributed-llama
VITE_LLM_STREAM=true
VITE_TTS_API_BASE=http://localhost:8080
```

프론트는 라즈베리파이의 `POST /v1/chat/completions`를 `stream: true`로 호출합니다.
SSE에서 AvatarResponse JSON의 `text` 값을 점진적으로 추출하고, 문장이 완성되는 즉시 TTS
큐에 넣습니다. 다음 문장은 현재 음성이 재생되는 동안 미리 합성해 문장 사이의 공백을 줄입니다.
데모 버튼처럼 내용이 고정된 문장은 앱 로딩 후 백그라운드에서 미리 합성하고 메모리에 캐시해,
준비가 끝난 뒤에는 버튼을 누르자마자 재생합니다.

TTS는 맥의 `tts-server/macos-tts-server.py`가 제공하는 `GET /health`와
`GET /tts?text=...`를 사용합니다. LLM과 TTS는 서로 다른 서버입니다.

```bash
python3.11 -m venv ../tts-server/venv
../tts-server/venv/bin/pip install -r ../tts-server/requirements-melo.txt
sh ../tts-server/patch-melo-macos.sh
../tts-server/venv/bin/python ../tts-server/macos-tts-server.py \
  --backend melo --port 8080
```

Melo 서버는 기본적으로 `voice/티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3`를
OpenVoiceV2 레퍼런스로 사용합니다.

## 음성 입력(STT)

입력창 옆 `🎤 말하기` 버튼을 누르면 마이크 녹음이 시작되고, **말을 멈추면(약 1.2초 침묵)
자동으로** 녹음을 끝내 TTS 서버의 `POST /stt`로 보내 한국어로 받아쓴 뒤 바로
실행(runPrompt)합니다. 버튼을 다시 눌러 수동으로 끝낼 수도 있습니다(침묵 감지는 브라우저
Web Audio RMS 측정, 안전 상한 15초). 받아쓰기는 맥 TTS 서버에 추가된 faster-whisper가
처리하며 TTS와 같은 서버/포트를 씁니다.

```bash
../tts-server/venv/bin/python -m pip install -r ../tts-server/requirements-stt.txt
```

모델은 `--stt-model`로 바꿀 수 있고(기본 `small`), 서버 시작 시 미리 로드/워밍업해
첫 요청 지연을 없앱니다(`--no-stt-warmup`으로 끔). 디코딩은 짧은 명령에 맞춰
greedy(beam_size=1)로 빠르게 도는데, 정확도를 더 원하면 `transcribe()`의 `beam_size`를
올리면 됩니다.

> ⚠️ 브라우저 마이크(`getUserMedia`)는 보안 컨텍스트에서만 동작합니다. 노트북 본체에서
> `http://localhost:5173`로 접속하면 그대로 켜지지만, LAN IP(`http://10.x.x.x:5173`)로
> 접속하면 막힙니다. 폰·다른 기기에서 마이크를 쓰려면 아래 HTTPS 모드로 띄우세요.

### 다른 기기(폰 등)에서 마이크 쓰기 — HTTPS 모드

`npm run dev`는 `vite.config.js`에서 자가서명 인증서로 **HTTPS** dev 서버를 띄웁니다.
HTTPS 페이지는 http 백엔드를 직접 호출할 수 없어(mixed content), vite가 두 백엔드를
서버사이드에서 프록시합니다:

- `/v1`, `/reset` → 라즈베리파이 LLM(`VITE_PI_API_BASE`)
- `/health`, `/voices`, `/tts`, `/stt` → 맥 TTS/STT 서버(`VITE_TTS_API_BASE`, 기본 `localhost:8080`)

폰에서 `https://<맥IP>:5173`로 접속하면 자가서명 경고가 한 번 뜹니다. "계속/방문"을
누르면 보안 컨텍스트가 되어 마이크가 열리고, TTS·STT·LLM 호출은 모두 프록시를 탑니다.
(HTTPS 접속일 때 프론트는 same-origin 상대경로로 호출하므로 `VITE_*_API_BASE`는 프록시
타깃으로만 쓰입니다.)

## VRM 모델

`public/models/momo.vrm`에 VRM 파일을 넣으면 실제 3D 캐릭터가 로드됩니다.  
파일이 없으면 fallback mascot이 표시됩니다.
