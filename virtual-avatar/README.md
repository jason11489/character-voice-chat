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

## VRM 모델

`public/models/momo.vrm`에 VRM 파일을 넣으면 실제 3D 캐릭터가 로드됩니다.  
파일이 없으면 fallback mascot이 표시됩니다.
