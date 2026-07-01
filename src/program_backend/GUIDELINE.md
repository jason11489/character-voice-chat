# 캐릭터 음성 채팅 — 맥북에서 전부 구현 (라즈베리파이는 LLM만)

> 맥북의 Claude Code에게 이 문서를 그대로 전달하면 됨.
> 핵심: **라즈베리파이는 LLM 추론 API만**, **채팅 페이지·캐릭터·TTS는 전부 맥북**에서.

## 1. 아키텍처

- **라즈베리파이 (10.56.130.224)** — `dllama-api` 가 OpenAI 호환 LLM API를 `:9999` 로 서빙 중. **건드릴 것 없음.**
  - 엔드포인트: `POST http://10.56.130.224:9999/v1/chat/completions` (SSE 스트리밍, `stream:true`)
  - 이미 `Access-Control-Allow-Origin: *` 줌 → 브라우저에서 직접 호출 OK.
- **맥북 (이번 작업 전부)** — 한 개의 로컬 서버가:
  1. 정적 페이지 `chat-ui.html`(캐릭터 + 채팅 UI) 서빙
  2. `GET /tts` 로 텍스트→음성(WAV) 제공
- **브라우저** (맥 자신 또는 같은 WiFi의 폰/PC) — 맥에서 페이지를 열고: 글자(추론)는 라즈베리파이로, 음성은 맥(같은 오리진)으로 요청.

```
[브라우저] --(페이지+TTS, 같은 오리진)--> [맥북 서버 :PORT]
     \-----(LLM 토큰 스트리밍)-----------> [라즈베리파이 :9999]
```

장점: 페이지와 TTS가 **같은 서버 = 같은 오리진**이라 TTS 쪽 CORS 신경 불필요. 프록시 불필요.

## 2. 받게 될 파일 (라즈베리파이 레포에서 복사해 옴)

- `chat-ui.html` — 이미 동작하는 채팅 UI. 포함: 토큰 SSE 스트리밍, **EMO 스타일 SVG 로봇 캐릭터**(눈 깜빡임/입 모션/통통 튐), 문장 단위 분할기, 브라우저 내장 TTS(가짜 입 움직임). → **여기에 "맥 서버 오디오 재생 + 실제 음량 입싱크"를 더하는 게 이번 작업.**
- `tts-server/macos-tts-server.py` — 바로 실행 가능한 참조 서버. `say` 기본 + `--backend melo`, `--serve-dir`(정적 파일 서빙) 지원, CORS/프리플라이트/길이상한 포함.

## 3. 맥 서버 실행 (가장 간단한 1프로세스 구성)

```bash
# chat-ui.html 이 있는 폴더 기준
python3 tts-server/macos-tts-server.py --port 8080 --serve-dir .
# → 페이지:  http://<맥IP>:8080/chat-ui.html
# → TTS:    http://<맥IP>:8080/tts?text=...&rate=1.0
```
- 맥 IP 확인: `ipconfig getifaddr en0`
- 방화벽 켜져 있으면 python 들어오는 연결 허용.
- 페이지와 TTS가 같은 서버라, chat-ui의 "TTS 서버" 칸은 비워두면 됨(상대경로 `/tts` 사용).

### 음성 엔진 — 2단계
- **1단계(설치 0): macOS `say`**
  - `say -r <wpm> -v Yuna -o out.aiff -- "text"` → `afconvert out.aiff out.wav -d LEI16@22050 -f WAVE` → WAV 반환.
  - `rate(0.5~1.8)` → `wpm = clamp(int(175*rate), 80, 360)`.
  - 음질↑: **시스템 설정 → 손쉬운 사용 → 콘텐츠 말하기 → 시스템 음성 → 음성 관리**에서 **"Yuna(향상됨)"** 다운로드.
  - 명령 주입 방지: `--` 뒤 텍스트, `shell=True` 금지(argv 리스트).
- **2단계(더 자연): MeloTTS(KR)** — `--backend melo`. torch 등 의존성 까다로움 → **Python 3.10~3.11 깨끗한 venv** 권장, 안 되면 1단계로.

## 4. chat-ui.html 에 추가할 것 (프런트엔드)

> 현재 chat-ui.html 의 관련 부분: `makeSentenceSplitter()`(문장 분할), `enqueueTts()/drainTts()`(현재는 Web Speech), `setSpeaking()` + `emoLoop()`(rAF 렌더 루프, 지금은 사인파로 입 움직임).

### 4-1. 설정 UI
- "TTS 서버" URL 입력칸(기본: 빈 값 = 같은 오리진 `/tts`). localStorage 저장.
- TTS 모드: `서버` / `브라우저 내장(폴백)` / `끄기`.

### 4-2. 재생 파이프라인 (순서 보장 + 끊김 최소화)
- `AudioContext` 1개. **전송 버튼 클릭 시 `ctx.resume()`**(자동재생 정책).
- 문장 큐(이미 있는 분할기 재사용) 소비 펌프:
  1. 문장 → `fetch(ttsBase + "/tts?text="+encodeURIComponent(s)+"&rate="+rate)` → `arrayBuffer` → `ctx.decodeAudioData`.
  2. **다음 문장은 현재 재생 중 prefetch**(fetch(n+1) ∥ play(n))로 공백 최소화.
  3. `BufferSource → AnalyserNode → destination` 연결, 재생. `onended`→다음. **재생은 반드시 큐 순서.**
- 새 전송/컨텍스트 초기화 시 큐 비우고 현재 소스 `stop()`.

### 4-3. 실제 입싱크 (핵심 — 가짜 사인파 대체)
- 재생 소스를 `AnalyserNode`(fftSize 256~512)에 연결.
- `emoLoop()`(rAF)에서 서버 오디오 재생 중이면: `analyser.getByteTimeDomainData()`로 **RMS(음량)** 계산 → 0~1 정규화 → 캐릭터 입(`#mouth` height) 타깃. (브라우저 내장 폴백일 땐 기존 사인파 유지.)
- 눈/몸 들썩임 등 나머지 EMO 모션은 그대로.

### 4-4. 폴백/에러
- `/health` 실패하거나 `/tts` 오류 → 브라우저 내장 TTS로 자동 폴백 + 상태표시.
- LLM 주소(`baseUrl`)는 라즈베리파이 `http://10.56.130.224:9999` 로(이미 입력칸 있음).

## 5. 함정 체크리스트
- **자동재생 정책**: 사용자 제스처(전송 클릭) 후 `AudioContext.resume()` 필요.
- **WAV 포맷만**: `decodeAudioData` 가 못 읽는 AIFF/CAF 금지 → 표준 PCM WAV.
- **재생 순서**: 병렬 fetch해도 재생은 큐 순서.
- **혼합 콘텐츠(Mixed Content)**: 페이지를 https로 열면 http(LLM/TTS) 호출 막힘. **전부 http(LAN)** 로 통일.
- **같은 오리진 권장**: 페이지와 TTS를 같은 맥 서버로 주면 CORS 무신경. 별 서버로 나누면 TTS에 CORS 헤더 필수.
- **IP 변동**: 맥 IP 바뀌면 페이지 주소/입력칸 갱신. 고정 IP나 `<맥이름>.local` 권장.
- **라즈베리파이 CORS**: 이미 `*` 라 OK. 단 LLM 주소를 https로 적으면 안 됨(서버가 http).

## 6. 완료 기준(테스트)
1. 맥에서 `--serve-dir .` 로 서버 실행 → 폰 브라우저로 `http://<맥IP>:8080/chat-ui.html` 열림.
2. baseUrl = `http://10.56.130.224:9999` 확인 → 메시지 전송 시 **첫 문장 완성 즉시** 말하기 시작.
3. 말하는 동안 캐릭터 입이 **음성 크기에 맞춰** 움직임.
4. 서버 TTS 끄거나 죽이면 브라우저 내장으로 자동 폴백.
