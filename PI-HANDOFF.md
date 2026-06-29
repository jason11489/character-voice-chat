# 라즈베리파이 배포 핸드오프 (Pi쪽 Claude용)

이 문서는 **라즈베리파이에서 작업하는 Claude**에게 넘기는 지시서입니다. 맥에서 코드/구성은
이미 끝났고, Pi에서는 **ARM 리눅스용 의존성 설치 + 실행**만 하면 됩니다.

## 목표

명령 한 줄로 **STT·TTS·UI가 한 프로세스(`:8080`)** 에서 켜지게 만든다. LLM은 외부 박스에 있다.

```bash
# 최종 실행 형태 (이게 동작하면 끝)
venv/bin/python tts-server/macos-tts-server.py \
  --backend melo \
  --serve-dir virtual-avatar/dist \
  --port 8080
```

성공 기준:
- `http://localhost:8080/` 로 3D 아바타 UI가 뜬다
- 마이크로 말하면 `POST /stt` 가 텍스트를 돌려준다 (faster-whisper)
- LLM 응답 문장이 `GET /tts` 로 합성돼 재생된다 (MeloTTS + OpenVoice 음색변환)

> 파일명이 `macos-tts-server.py` 지만 melo 경로는 OS 독립적이다. Pi에서는 melo 백엔드만 쓴다.

## 환경 전제

- 라즈베리파이 **64-bit OS (aarch64)** — torch CPU 휠 때문에 필수. `uname -m` 이 `aarch64` 여야 함.
- Python **3.11**
- LLM은 **다른 박스**. Pi는 STT+TTS+UI만.
- 디스플레이 + 마이크가 Pi에 연결된 **키오스크** 형태. UI는 Pi 로컬 브라우저로 `http://localhost:8080/` 에서 연다.
  - `localhost` 는 보안 컨텍스트라 http 로도 마이크(`getUserMedia`)가 동작 → **HTTPS 불필요**.
  - 다른 기기에서 `http://<pi-ip>:8080` 으로 열면 마이크가 막히니 하지 말 것.

## ⚠️ macOS 전용 — Pi에서 절대 쓰지 말 것

- `--backend say` (macOS `say`/`afconvert` 호출) → 리눅스에 없음. **항상 `--backend melo`**.
- `tts-server/patch-melo-macos.sh` → macOS mecab 패치. Pi에선 실행 금지.
- `run-tts.sh` → 맥 경로/`--serve-dir`(레포 루트) 가정. Pi에선 위 목표 명령을 직접 쓴다.

## git에 없어서 따로 준비해야 하는 것

`clone` 하면 코드만 온다. 아래는 `.gitignore` 라 **수동 확보** 필요:

| 항목 | 경로 | 확보 방법 |
|---|---|---|
| OpenVoice 체크포인트 | `tts-server/checkpoints_v2/` | **`fetch-models.sh`** (아래) |
| OpenVoice 소스 | `tts-server/openvoice-src/` | **`fetch-models.sh`** (github 클론) |
| MeloTTS 한국어 HF 모델 | `~/.cache/huggingface/` | **`fetch-models.sh`** (오프라인 모드라 필수) |
| Python venv | `tts-server/venv/` | Pi에서 새로 생성 (휠이 ARM 전용이라 맥 것 복사 불가) |
| 프론트 의존성/빌드 | `virtual-avatar/node_modules`, `dist` | Pi에서 `npm install && npm run build` |
| 음색 레퍼런스 | `voice/*.mp3` | git에 포함됨(추적됨). 단 `tts-server/teemo_ref.wav`(`*.wav`)는 미추적 |

### 모델 받기: `tts-server/fetch-models.sh`

대용량 모델(~780MB)은 git에 안 올린다(GitHub 100MB 단일파일 제한 + 히스토리 비대화).
대신 **venv 설치 후 스크립트 한 번**으로 받는다. 받는 것:
- OpenVoice 소스(`openvoice-src`) — github 클론
- OpenVoice V2 체크포인트(`checkpoints_v2`) — HuggingFace 미러 `myshell-ai/OpenVoiceV2`
  (공식 S3 zip `checkpoints_v2_0417.zip` 은 현재 404라 미러를 쓴다)
- MeloTTS 한국어 모델 + `kykim/bert-kor-base` — HF 캐시 prefetch

```bash
sh tts-server/fetch-models.sh   # 아래 설치 3단계(venv+deps) 끝난 뒤 실행
```

스크립트가 검증하는 체크포인트 경로:
- `tts-server/checkpoints_v2/converter/config.json`
- `tts-server/checkpoints_v2/converter/checkpoint.pth`
- `tts-server/checkpoints_v2/base_speakers/ses/kr.pth`

## 설치 단계 (각 단계마다 verify)

### 1. 시스템 패키지

```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv build-essential \
  mecab libmecab-dev   # 한국어 형태소 분석(아래 4번 참고)
```
verify: `python3.11 --version` → 3.11.x

### 2. venv + torch (CPU)

```bash
cd ~/character-voice-chat
python3.11 -m venv tts-server/venv
tts-server/venv/bin/pip install --upgrade pip
# ⚠️ PyPI 기본 aarch64 torch 휠은 이제 CUDA 빌드(libcudart.so.13)라 Pi(GPU 없음)에서 깨진다.
#    torch + torchaudio 둘 다 cpu 인덱스를 "명시"해서 받아야 한다. (휠 없으면 ==2.2.2 로 고정)
tts-server/venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchaudio
```
verify: `tts-server/venv/bin/python -c "import torch, torchaudio; print(torch.__version__, 'cuda=', torch.version.cuda)"` → `cuda= None`

### 3. TTS/STT 파이썬 의존성

```bash
tts-server/venv/bin/pip install -r tts-server/requirements-melo.txt
tts-server/venv/bin/pip install -r tts-server/requirements-stt.txt
```
⚠️ MeloTTS 의존성이 torch/torchaudio 를 CUDA 빌드로 되돌릴 수 있다. 설치 후 **반드시 재확인**하고,
CUDA로 바뀌었으면 2단계 명령으로 다시 깐다(`pip uninstall -y torch torchaudio` 후 cpu 인덱스 재설치).

verify: `tts-server/venv/bin/python -c "import torch; print('cuda=', torch.version.cuda); from melo.api import TTS; from faster_whisper import WhisperModel; print('ok')"` → `cuda= None` + `ok`

### 3b. 모델/소스 받기

```bash
sh tts-server/fetch-models.sh
```
verify: 위 "스크립트가 검증하는 체크포인트 경로" 3개가 존재하고, `~/.cache/huggingface/hub` 에
`models--myshell-ai--MeloTTS-Korean`, `models--kykim--bert-kor-base` 가 생긴다.

### 4. ⚠️ 최대 난관: 한국어 mecab (`python-mecab-ko`)

MeloTTS 한국어는 `python-mecab-ko` 로 형태소 분석을 한다. ARM 휠이 없으면 빌드가 필요하다.

verify 먼저: `tts-server/venv/bin/python -c "import mecab; mecab.MeCab(); print('mecab ok')"`
- 통과하면 넘어간다.
- 실패(사전 못 찾음/빌드 오류)하면: `mecab-ko` + `mecab-ko-dic` 를 소스로 빌드 후 재설치.
  (apt 의 `mecab-ipadic` 는 일본어 사전이라 한국어엔 안 맞음. `mecab-ko-dic` 가 필요.)

### 5. 프론트 빌드

```bash
cd virtual-avatar
npm install
# .env: VITE_PI_API_BASE 만 외부 LLM 주소로. VITE_TTS_API_BASE 는 비워둔다(동일 오리진).
npm run build
cd ..
```
verify: `virtual-avatar/dist/index.html` 존재

### 6. 실행 + 검증

```bash
venv/bin/python tts-server/macos-tts-server.py \
  --backend melo --serve-dir virtual-avatar/dist --port 8080
```
첫 기동은 모델 로딩으로 수십 초. 아래 로그가 떠야 정상:
- `MeloTTS(KR) 로드 완료 (device=cpu)`
- `OpenVoiceV2 변환기 로드 완료`
- `faster-whisper(...) 워밍업 완료`
- `🔊 TTS 서버 시작: http://0.0.0.0:8080`

verify(다른 터미널):
```bash
curl http://localhost:8080/health                       # {"ok": true, "backend": "melo", ...}
curl -o /tmp/t.wav "http://localhost:8080/tts?text=안녕하세요"   # WAV 생성되면 합성 OK
curl -I http://localhost:8080/assets/ | head             # UI 자산 서빙 확인
```
그 다음 Pi 로컬 브라우저로 `http://localhost:8080/` → 아바타 + 마이크 대화 확인.

## 알려진 함정 정리

- **HF 오프라인**: `macos-tts-server.py:31-32` 가 `HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE=1` 을 건다.
  → melo 모델이 캐시에 없으면 로드 실패. `fetch-models.sh` 가 미리 캐시를 채운다(그 단계를 건너뛰었다면 실행).
  스크립트가 막히면 **최초 1회만** 서버를 온라인으로 띄워 받게 할 수도 있다:
  `HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 venv/bin/python tts-server/macos-tts-server.py --backend melo ...`
  (whisper 로더는 자체적으로 오프라인을 잠시 끄므로 STT 모델은 첫 실행 때 알아서 받는다 — 네트워크 필요)
- **device**: melo 는 `device="auto"` 라 Pi에선 자동으로 `cpu`. OpenVoice·whisper 는 코드에서 이미 `cpu` 고정. 손댈 것 없음.
- **포트는 8080 고정**: 프론트의 TTS 주소 자동탐색이 `<host>:8080` 을 쓴다(맥에서 정한 구성 A). 다른 포트로 바꾸면 UI는 떠도 TTS/STT fetch 가 깨진다.
- **성능**: Pi CPU라 문장당 합성이 맥보다 느릴 수 있다. STT 모델은 기본 `small`. 너무 느리면 `--stt-model base` 로 낮춘다.

## 막히면

맥쪽 Claude/사람에게 다음을 공유하면 빠르다: `uname -m`, 실패한 verify 명령과 전체 에러 로그,
`tts-server/venv/bin/pip list | grep -iE "torch|melo|mecab|faster|ctranslate"`.
