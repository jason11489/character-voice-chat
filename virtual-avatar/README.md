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

프론트는 라즈베리파이의 `POST /v1/chat/completions`를 `stream: true`로 호출하고, SSE `data:` 라인을 이어붙여 응답을 만듭니다. 응답에 JSON 외 텍스트가 섞여도 최대한 정리해서 표시합니다.

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
