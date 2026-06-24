# pi-llm-server

라즈베리파이에서 실행하는 FastAPI 서버입니다.

## 실행

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Mock 모드

`.env`:

```env
LLM_PROVIDER=mock
```

## Ollama 모드

라즈베리파이 또는 다른 머신에서 Ollama가 떠 있다면:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

## API

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"user_text":"이번 달 전기세 줄이고 싶어","context":{"pet":"dog","indoor_temp":29}}'
```

## TTS

기본값은 mock TTS입니다. 실제 모델 없이도 `/tts`가 WAV를 반환하므로 프론트 오디오 연결을 테스트할 수 있습니다.

```bash
curl -X POST http://localhost:8000/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"안녕! 지금은 TTS 테스트 중이야.","language":"Korean"}' \
  --output output.wav
```

Qwen3-TTS를 쓰려면 별도 의존성을 설치하고 `.env`를 설정하세요.

```bash
pip install -r requirements-tts.txt
```

```env
TTS_PROVIDER=qwen
TTS_MODEL=Qwen/Qwen3-TTS-12Hz-0.6B-Base
TTS_DEVICE=cuda:0
TTS_DTYPE=bfloat16
TTS_LANGUAGE=Korean
TTS_REF_AUDIO=/absolute/path/to/reference.wav
TTS_REF_TEXT=참조 음성에 들어있는 문장을 그대로 적어주세요.
```

`Qwen3-TTS-12Hz-0.6B-Base`는 voice clone 방식이므로 `TTS_REF_AUDIO`와 `TTS_REF_TEXT`가 필요합니다.
