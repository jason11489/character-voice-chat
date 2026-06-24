# virtual-avatar

노트북에서 실행하는 React + Three.js 3D 캐릭터 앱입니다.

## 실행

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`에서 라즈베리파이 IP와 LLM 모델명을 설정하세요.

```env
VITE_PI_API_BASE=http://192.168.0.23:8000
VITE_LLM_MODEL=distributed-llama
VITE_LLM_STREAM=true
VITE_TTS_API_BASE=http://192.168.0.23:8000
```

프론트는 기본적으로 `POST /v1/chat/completions`를 `stream: true`로 호출하고, SSE `data:` 라인을 이어붙여 응답을 만듭니다. 응답에 JSON 외 텍스트가 섞여도 최대한 정리해서 표시하고, 그 경로가 없으면 기존 `POST /chat`으로 fallback합니다. `VITE_TTS_API_BASE`를 따로 주면 TTS 서버를 LLM 서버와 분리해서 붙일 수 있습니다.

## VRM 모델

`public/models/momo.vrm`에 VRM 파일을 넣으면 실제 3D 캐릭터가 로드됩니다.  
파일이 없으면 fallback mascot이 표시됩니다.
