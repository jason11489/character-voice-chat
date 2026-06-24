#!/usr/bin/env python3
"""
맥북용 한국어 TTS HTTP 서버 (chat-ui.html 연동)

- 기본 백엔드: macOS 내장 `say` (추가 설치 0). 'Yuna' 등 한국어 음성 사용.
- 선택 백엔드: MeloTTS (--backend melo). 더 자연스럽지만 pip 설치 필요.
- 선택 백엔드: Qwen3-TTS (--backend qwen). 로컬 추론, 한국어 화자 Sohee. pip + 모델 다운로드 필요.

브라우저(chat-ui)가 같은 WiFi에서 GET /tts?text=... 로 호출하면 WAV(오디오)를 돌려줍니다.
WAV를 받기 때문에 브라우저에서 실제 음량 기반 입싱크가 가능합니다.

실행 (맥 터미널):
    python3 macos-tts-server.py                 # say 백엔드, 포트 5050
    python3 macos-tts-server.py --voice Yuna --port 5050
    python3 macos-tts-server.py --backend melo  # MeloTTS 사용(설치돼 있을 때)
    python3 macos-tts-server.py --backend qwen  # Qwen3-TTS 사용(pip install -U qwen-tts 후)

종료: Ctrl+C
"""

import argparse
import io
import os
import re
import shlex
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))

ARGS = None
MELO_TTS = None          # MeloTTS 모델 (지연 로딩)
MELO_SPEAKER = None
MELO_LOCK = threading.Lock()

QWEN_TTS = None          # Qwen3-TTS 모델 (지연 로딩)
QWEN_LOCK = threading.Lock()

# OpenVoiceV2 음색 변환 (melo 백엔드 + --voice-convert 일 때만). MELO_LOCK 으로 직렬화.
OV_CONVERTER = None      # ToneColorConverter (지연 로딩)
OV_SRC_SE = None         # melo KR 화자 임베딩 (kr.pth)
OV_TGT_SE = None         # 레퍼런스에서 추출한 타겟 음색

MAX_TEXT = 600           # 한 번에 합성할 최대 글자 수(과부하 방지)


# --------------------------- 백엔드: macOS say ---------------------------
def synth_say(text: str, voice: str, rate: float) -> bytes:
    """macOS `say` 로 합성 후 WAV(LEI16/22050) 바이트 반환."""
    wpm = max(80, min(360, int(175 * rate)))
    with tempfile.TemporaryDirectory() as d:
        aiff = os.path.join(d, "out.aiff")
        wav = os.path.join(d, "out.wav")
        cmd = ["say", "-r", str(wpm), "-o", aiff]
        if voice:
            cmd += ["-v", voice]
        cmd += ["--", text]                      # '--' 이후는 옵션 아님(주입 방지)
        subprocess.run(cmd, check=True, capture_output=True)
        # AIFF -> WAV (브라우저 decodeAudioData 호환). afconvert 는 macOS 기본 제공.
        subprocess.run(
            ["afconvert", aiff, wav, "-d", "LEI16@22050", "-f", "WAVE"],
            check=True, capture_output=True,
        )
        with open(wav, "rb") as f:
            return f.read()


def list_say_voices():
    try:
        out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    except Exception:
        return []
    voices = []
    for line in out.splitlines():
        # 형식: "Yuna                ko_KR    # ..."  또는
        #       "Eddy (한국어(한국))      ko_KR    # ..." (이름에 괄호 설명 포함)
        m = re.search(r"([a-z]{2}_[A-Z]{2})", line)
        if not m:
            continue
        lang = m.group(1)
        name = line[:m.start()].strip()
        # 표시용 괄호 설명 제거: "Eddy (한국어(한국))" -> "Eddy"  (say -v 는 기본 이름 사용)
        name = re.split(r"\s+\(", name)[0].strip()
        if name:
            voices.append({"name": name, "lang": lang})
    return voices


# --------------------------- 백엔드: MeloTTS ---------------------------
def load_melo():
    global MELO_TTS, MELO_SPEAKER
    if MELO_TTS is not None:
        return
    from melo.api import TTS  # type: ignore
    device = "auto"            # Apple Silicon 이면 MPS 자동 선택
    MELO_TTS = TTS(language="KR", device=device)
    MELO_SPEAKER = MELO_TTS.hps.data.spk2id  # {'KR': 0}
    print(f"MeloTTS(KR) 로드 완료 (device={MELO_TTS.device})")
    # MPS 첫 추론 워밍업 → 실제 첫 요청 지연 제거
    try:
        spk = list(MELO_SPEAKER.values())[0]
        with tempfile.TemporaryDirectory() as d:
            MELO_TTS.tts_to_file("안녕하세요", spk, os.path.join(d, "w.wav"), speed=1.0, quiet=True)
        print("MeloTTS 워밍업 완료")
    except Exception as e:
        print("MeloTTS 워밍업 건너뜀:", e)


def resolve_reference(ref: str) -> str:
    """--voice-convert 값을 레퍼런스 오디오 경로로 해석.
    파일 경로면 그대로, 아니면 openvoice 데모 화자 이름(demo_speaker0 등)으로 본다."""
    if os.path.isfile(ref):
        return ref
    name = ref if ref.lower().endswith((".mp3", ".wav")) else ref + ".mp3"
    cand = os.path.join(HERE, "openvoice-src", "resources", name)
    if os.path.isfile(cand):
        return cand
    raise FileNotFoundError(f"레퍼런스 음성을 찾을 수 없음: {ref}")


def load_openvoice():
    """OpenVoiceV2 변환기 + 소스/타겟 SE 로드. melo KR 출력을 레퍼런스 음색으로 변환."""
    global OV_CONVERTER, OV_SRC_SE, OV_TGT_SE
    if OV_CONVERTER is not None:
        return
    import torch  # type: ignore
    sys.path.insert(0, os.path.join(HERE, "openvoice-src"))
    from openvoice.api import ToneColorConverter  # type: ignore

    ckpt = os.path.join(HERE, "checkpoints_v2")
    dev = "cpu"  # 변환기는 작아서 CPU 로 충분하고 MPS 호환 이슈를 피한다
    conv = ToneColorConverter(os.path.join(ckpt, "converter", "config.json"), device=dev)
    conv.load_ckpt(os.path.join(ckpt, "converter", "checkpoint.pth"))
    OV_SRC_SE = torch.load(
        os.path.join(ckpt, "base_speakers", "ses", "kr.pth"), map_location=dev
    )
    ref_path = resolve_reference(ARGS.voice_convert)
    OV_TGT_SE = conv.extract_se(ref_path)
    OV_CONVERTER = conv
    print(f"OpenVoiceV2 변환 로드 완료 (reference={os.path.basename(ref_path)}, device={dev})")


def synth_melo(text: str, rate: float) -> bytes:
    with MELO_LOCK:
        load_melo()
        spk = list(MELO_SPEAKER.values())[0]
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, "out.wav")
            # speed: 1.0 기준, UI rate 그대로 사용
            MELO_TTS.tts_to_file(text, spk, wav, speed=float(rate), quiet=True)
            if ARGS.voice_convert:
                load_openvoice()
                out = os.path.join(d, "conv.wav")
                OV_CONVERTER.convert(
                    audio_src_path=wav, src_se=OV_SRC_SE, tgt_se=OV_TGT_SE,
                    output_path=out,
                )
                wav = out
            with open(wav, "rb") as f:
                return f.read()


# --------------------------- 백엔드: Qwen3-TTS (로컬) ---------------------------
def load_qwen():
    global QWEN_TTS
    if QWEN_TTS is not None:
        return
    import torch  # type: ignore
    from qwen_tts import Qwen3TTSModel  # type: ignore

    if ARGS.device != "auto":
        device = ARGS.device
    elif torch.backends.mps.is_available():
        device = "mps"            # Apple Silicon
    elif torch.cuda.is_available():
        device = "cuda:0"
    else:
        device = "cpu"

    # bfloat16 은 가속기에서만. flash_attention_2 는 CUDA 전용 → Mac/CPU 에선 미지정.
    dtype = torch.bfloat16 if device != "cpu" else torch.float32
    kwargs = dict(device_map=device, dtype=dtype)
    if device.startswith("cuda"):
        kwargs["attn_implementation"] = "flash_attention_2"

    QWEN_TTS = Qwen3TTSModel.from_pretrained(ARGS.qwen_model, **kwargs)
    print(f"Qwen3-TTS 로드 완료 (device={device}, dtype={dtype})")
    # 첫 추론 워밍업 → 실제 첫 요청 지연 제거
    try:
        QWEN_TTS.generate_custom_voice(
            text="안녕하세요", language=ARGS.qwen_language, speaker=ARGS.qwen_speaker,
        )
        print("Qwen3-TTS 워밍업 완료")
    except Exception as e:
        print("Qwen3-TTS 워밍업 건너뜀:", e)


def synth_qwen(text: str) -> bytes:
    import io as _io
    import soundfile as sf  # type: ignore
    with QWEN_LOCK:
        load_qwen()
        wavs, sr = QWEN_TTS.generate_custom_voice(
            text=text, language=ARGS.qwen_language, speaker=ARGS.qwen_speaker,
        )
        # numpy float → 표준 PCM16 WAV (브라우저 decodeAudioData 호환). rate 는 미지원.
        buf = _io.BytesIO()
        sf.write(buf, wavs[0], sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()


def synthesize(text: str, voice: str, rate: float) -> bytes:
    if ARGS.backend == "qwen":
        return synth_qwen(text)
    if ARGS.backend == "melo":
        return synth_melo(text, rate)
    return synth_say(text, voice or ARGS.voice, rate)


# --------------------------- HTTP 핸들러 ---------------------------
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            voice = ARGS.qwen_speaker if ARGS.backend == "qwen" else ARGS.voice
            self._send_json({"ok": True, "backend": ARGS.backend, "voice": voice})
            return
        if parsed.path == "/voices":
            self._send_json({"voices": list_say_voices()})
            return
        if parsed.path != "/tts":
            # /tts, /health, /voices 외의 경로는 정적 파일로 서빙(채팅 페이지 등).
            if ARGS.serve_dir:
                self._serve_static(parsed.path)
            else:
                self.send_response(404); self._cors(); self.end_headers()
                self.wfile.write(b"not found")
            return

        text = (qs.get("text", [""])[0] or "").strip()[:MAX_TEXT]
        voice = qs.get("voice", [""])[0]
        try:
            rate = float(qs.get("rate", ["1.0"])[0])
        except ValueError:
            rate = 1.0
        if not text:
            self.send_response(400); self._cors(); self.end_headers()
            self.wfile.write(b"missing text")
            return

        try:
            audio = synthesize(text, voice, rate)
        except subprocess.CalledProcessError as e:
            msg = (e.stderr or b"").decode(errors="ignore")
            self._send_error(500, f"say 실패: {msg}")
            return
        except Exception as e:
            self._send_error(500, f"합성 오류: {e}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self._cors()
        self.end_headers()
        self.wfile.write(audio)

    def _serve_static(self, path):
        # 디렉터리 탈출 방지 후 파일 서빙. "/" 는 chat-ui.html 로.
        rel = urllib.parse.unquote(path).lstrip("/")
        if rel == "":
            rel = "chat-ui.html"
        base = os.path.realpath(ARGS.serve_dir)
        full = os.path.realpath(os.path.join(base, rel))
        if not full.startswith(base) or not os.path.isfile(full):
            self.send_response(404); self._cors(); self.end_headers()
            self.wfile.write(b"not found")
            return
        ctype = "text/html; charset=utf-8" if full.endswith(".html") else "application/octet-stream"
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, obj):
        import json
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _send_error(self, code, msg):
        body = msg.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *a):
        sys.stderr.write("· " + (fmt % a) + "\n")


def main():
    global ARGS
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=5050)
    p.add_argument("--backend", choices=["say", "melo", "qwen"], default="say")
    p.add_argument("--voice", default="Yuna", help="say 백엔드 음성 (예: Yuna)")
    p.add_argument("--device", default="auto", help="qwen 백엔드 디바이스 (auto/mps/cuda:0/cpu)")
    p.add_argument("--qwen-model", default="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
                   help="qwen 백엔드 HF 모델 ID")
    p.add_argument("--qwen-speaker", default="Sohee", help="qwen 화자 (한국어: Sohee)")
    p.add_argument("--qwen-language", default="Korean", help="qwen 언어")
    p.add_argument("--voice-convert", default=None,
                   help="melo 백엔드 OpenVoiceV2 음색 변환 레퍼런스 "
                        "(데모 이름 demo_speaker0/1/2 또는 wav/mp3 경로)")
    p.add_argument("--serve-dir", default=None,
                   help="정적 파일 디렉터리(chat-ui.html 위치). 지정하면 페이지+TTS를 한 서버에서 제공")
    ARGS = p.parse_args()

    if ARGS.backend == "say":
        names = [v["name"] for v in list_say_voices()]
        if ARGS.voice not in names:
            print(f"⚠️  '{ARGS.voice}' 음성이 없습니다. 설치된 한국어 음성:")
            for v in list_say_voices():
                if v["lang"].startswith("ko"):
                    print("   -", v["name"])
            print("   (시스템 설정 → 손쉬운 사용 → 콘텐츠 말하기 → 시스템 음성 → 음성 관리에서 'Yuna(향상됨)' 다운로드 권장)")
    elif ARGS.backend == "melo":
        print("MeloTTS 백엔드: 모델을 미리 로드합니다(최초 수십 초 소요, 이후 문장당 ~1초)...")
        try:
            load_melo()
        except Exception as e:
            print("⚠️ MeloTTS 로드 실패 → say 로 폴백:", e)
            ARGS.backend = "say"
        if ARGS.backend == "melo" and ARGS.voice_convert:
            print(f"OpenVoiceV2 음색 변환 활성화(reference={ARGS.voice_convert}). 미리 로드합니다...")
            try:
                load_openvoice()
            except Exception as e:
                print("⚠️ OpenVoiceV2 로드 실패 → 변환 없이 melo 원본 사용:", e)
                ARGS.voice_convert = None
    else:  # qwen
        print(f"Qwen3-TTS 백엔드: 모델을 미리 로드합니다(최초 다운로드 수 GB·수십 초~분, "
              f"speaker={ARGS.qwen_speaker})...")
        try:
            load_qwen()
        except Exception as e:
            print("⚠️ Qwen3-TTS 로드 실패 → say 로 폴백:", e)
            ARGS.backend = "say"

    srv = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    print(f"🔊 TTS 서버 시작: http://{ARGS.host}:{ARGS.port}  (backend={ARGS.backend}, voice={ARGS.voice})")
    if ARGS.serve_dir:
        print(f"🌐 페이지도 서빙: http://<맥IP>:{ARGS.port}/chat-ui.html  (dir={os.path.realpath(ARGS.serve_dir)})")
        print("   → 같은 서버라 TTS 호출이 동일 오리진(CORS 걱정 없음). chat-ui 의 TTS 서버 칸은 비워두거나 같은 주소로.")
    else:
        print("   chat-ui 에 이 맥의 IP:포트를 'TTS 서버' 칸에 넣으세요 (예: http://10.56.x.x:5050)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")


if __name__ == "__main__":
    main()
