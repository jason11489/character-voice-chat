#!/usr/bin/env python3
"""
맥북용 한국어 TTS HTTP 서버 (chat-ui.html 연동)

- 기본 백엔드: macOS 내장 `say` (추가 설치 0). 'Yuna' 등 한국어 음성 사용.
- 선택 백엔드: MeloTTS (--backend melo). 더 자연스럽지만 pip 설치 필요.

브라우저(chat-ui)가 같은 WiFi에서 GET /tts?text=... 로 호출하면 WAV(오디오)를 돌려줍니다.
WAV를 받기 때문에 브라우저에서 실제 음량 기반 입싱크가 가능합니다.

실행 (맥 터미널):
    python3 macos-tts-server.py                 # say 백엔드, 포트 5050
    python3 macos-tts-server.py --voice Yuna --port 5050
    python3 macos-tts-server.py --backend melo  # MeloTTS 사용(설치돼 있을 때)

종료: Ctrl+C
"""

import argparse
import io
import os
import re
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MELO_VOICE = os.path.join(
    HERE,
    "..",
    "voice",
    "티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3",
)

ARGS = None
MELO_TTS = None          # MeloTTS 모델 (지연 로딩)
MELO_SPEAKER = None
MELO_LOCK = threading.Lock()
SYNTH_CACHE = {}
SYNTH_CACHE_LOCK = threading.Lock()

# OpenVoiceV2 음색 변환 (melo 백엔드). MELO_LOCK 으로 직렬화.
OV_CONVERTER = None      # ToneColorConverter (지연 로딩)
OV_SRC_SE = None         # melo KR 화자 임베딩 (kr.pth)
OV_TGT_CACHE = {}        # {레퍼런스 경로: 추출한 타겟 음색} — 음성별 SE 캐시

# STT(faster-whisper). 마이크 녹음(webm/opus)을 받아 한국어 텍스트로 변환. 지연 로딩.
WHISPER_MODEL = None
WHISPER_LOCK = threading.Lock()

MAX_TEXT = 600           # 한 번에 합성할 최대 글자 수(과부하 방지)

# MeloTTS prosody(억양/리듬) 튜닝. 기본값(0.2/0.8)은 밋밋해서 좀 더 사람스럽게 상향.
MELO_SDP_RATIO = 0.5     # ↑일수록 문장 리듬·끝음 억양이 살아남(확률적 길이예측 비중)
MELO_NOISE_SCALE_W = 0.9 # ↑일수록 음절 길이가 들쭉날쭉 → 메트로놈 느낌 제거


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


def list_ov_voices():
    """voice-dir 안의 mp3/wav 파일을 음색 변환용 음성 목록으로 반환(이름=파일명 stem)."""
    vd = ARGS.voice_dir
    out = []
    if vd and os.path.isdir(vd):
        for fn in sorted(os.listdir(vd)):
            if fn.lower().endswith((".mp3", ".wav")):
                out.append({"name": os.path.splitext(fn)[0], "lang": "ko"})
    return out


def resolve_ov_reference(voice: str) -> str:
    """UI 가 보낸 voice(파일명 stem) 를 voice-dir 파일 경로로 해석.
    못 찾으면 데모 이름/경로로 폴백."""
    vd = ARGS.voice_dir
    if vd and os.path.isdir(vd):
        for fn in os.listdir(vd):
            if os.path.splitext(fn)[0] == voice:
                return os.path.join(vd, fn)
    return resolve_reference(voice)


def load_openvoice():
    """OpenVoiceV2 변환기 + 소스 SE 로드. 타겟 SE 는 음성별로 지연 추출/캐시."""
    global OV_CONVERTER, OV_SRC_SE
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
    OV_CONVERTER = conv
    print(f"OpenVoiceV2 변환기 로드 완료 (device={dev})")


def get_tgt_se(ref_path: str):
    """레퍼런스에서 타겟 음색 SE 추출(경로별 캐시). 최초 1회만 수 초 소요."""
    key = os.path.realpath(ref_path)
    se = OV_TGT_CACHE.get(key)
    if se is None:
        se = OV_CONVERTER.extract_se(ref_path)
        OV_TGT_CACHE[key] = se
        print(f"OpenVoiceV2 음색 추출: {os.path.basename(ref_path)}")
    return se


def synth_melo(text: str, rate: float, voice: str = "",
               sdp_ratio: float = None, noise_scale_w: float = None) -> bytes:
    sdp = MELO_SDP_RATIO if sdp_ratio is None else sdp_ratio
    nsw = MELO_NOISE_SCALE_W if noise_scale_w is None else noise_scale_w
    with MELO_LOCK:
        load_melo()
        spk = list(MELO_SPEAKER.values())[0]
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, "out.wav")
            # speed: 1.0 기준, UI rate 그대로 사용. sdp_ratio/noise_scale_w 로 억양·리듬 보강.
            MELO_TTS.tts_to_file(
                text, spk, wav, speed=float(rate),
                sdp_ratio=sdp, noise_scale_w=nsw,
                quiet=True,
            )
            # 음색 변환 레퍼런스: UI 가 voice 를 주면 그걸, 없으면 서버 기본(--voice-convert).
            ref = None
            if voice:
                ref = resolve_ov_reference(voice)
            elif ARGS.voice_convert:
                ref = resolve_reference(ARGS.voice_convert)
            if ref:
                load_openvoice()
                out = os.path.join(d, "conv.wav")
                OV_CONVERTER.convert(
                    audio_src_path=wav, src_se=OV_SRC_SE, tgt_se=get_tgt_se(ref),
                    output_path=out,
                )
                wav = out
            with open(wav, "rb") as f:
                return f.read()


def synthesize(text: str, voice: str, rate: float,
               sdp_ratio: float = None, noise_scale_w: float = None) -> bytes:
    active_voice = voice or ARGS.voice_convert or ARGS.voice
    sdp = MELO_SDP_RATIO if sdp_ratio is None else sdp_ratio
    nsw = MELO_NOISE_SCALE_W if noise_scale_w is None else noise_scale_w
    cache_key = (ARGS.backend, active_voice, round(rate, 2),
                 round(sdp, 2), round(nsw, 2), text)

    with SYNTH_CACHE_LOCK:
        cached = SYNTH_CACHE.get(cache_key)
        if cached is not None:
            return cached

        if ARGS.backend == "melo":
            audio = synth_melo(text, rate, voice, sdp, nsw)
        else:
            audio = synth_say(text, voice or ARGS.voice, rate)

        if len(SYNTH_CACHE) >= 64:
            SYNTH_CACHE.pop(next(iter(SYNTH_CACHE)))
        SYNTH_CACHE[cache_key] = audio
        return audio


# --------------------------- STT: faster-whisper ---------------------------
def load_whisper():
    global WHISPER_MODEL
    if WHISPER_MODEL is not None:
        return
    from faster_whisper import WhisperModel  # type: ignore
    import huggingface_hub.constants as hf_const  # type: ignore
    # 최초 1회 모델 다운로드를 위해 HF 오프라인 잠시 해제(이후엔 캐시로 오프라인 동작).
    # 서버가 import 전에 HF_HUB_OFFLINE=1 을 걸어두므로 env 가 아닌 상수를 직접 토글한다.
    prev = hf_const.HF_HUB_OFFLINE
    hf_const.HF_HUB_OFFLINE = False
    try:
        WHISPER_MODEL = WhisperModel(ARGS.stt_model, device="cpu", compute_type="int8")
    finally:
        hf_const.HF_HUB_OFFLINE = prev
    print(f"faster-whisper({ARGS.stt_model}) 로드 완료")


def transcribe(data: bytes) -> str:
    """마이크 녹음 바이트(webm/opus 등)를 한국어 텍스트로 변환. WHISPER_LOCK 으로 직렬화."""
    with WHISPER_LOCK:
        load_whisper()
        # 짧은 명령 위주라 greedy(beam_size=1) + 이전 문맥 비참조로 디코딩을 빠르게.
        segments, _ = WHISPER_MODEL.transcribe(
            io.BytesIO(data), language="ko", beam_size=1,
            condition_on_previous_text=False, vad_filter=True,
        )
        return "".join(seg.text for seg in segments).strip()


def warmup_whisper():
    """서버 시작 시 모델 로드 + 더미 추론으로 ctranslate2 경로를 데워 첫 요청 지연 제거."""
    import numpy as np  # type: ignore
    with WHISPER_LOCK:
        load_whisper()
        segments, _ = WHISPER_MODEL.transcribe(
            np.zeros(16000, dtype=np.float32), language="ko", beam_size=1,
        )
        list(segments)  # generator 강제 실행


# --------------------------- HTTP 핸들러 ---------------------------
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/stt":
            self.send_response(404); self._cors(); self.end_headers()
            self.wfile.write(b"not found")
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        data = self.rfile.read(length) if length > 0 else b""
        if not data:
            self._send_error(400, "missing audio")
            return

        try:
            text = transcribe(data)
        except Exception as e:
            self._send_error(500, f"STT 오류: {e}")
            return

        self._send_json({"text": text})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            voice = (
                os.path.splitext(os.path.basename(ARGS.voice_convert))[0]
                if ARGS.backend == "melo" and ARGS.voice_convert
                else ("KR" if ARGS.backend == "melo" else ARGS.voice)
            )
            self._send_json({
                "ok": True,
                "backend": ARGS.backend,
                "voice": voice,
                "cached_sentences": len(SYNTH_CACHE),
                "melo_sdp_ratio": MELO_SDP_RATIO,
                "melo_noise_scale_w": MELO_NOISE_SCALE_W,
                "stt_model": ARGS.stt_model,
            })
            return
        if parsed.path == "/voices":
            if ARGS.backend == "melo":
                voices = list_ov_voices()       # 음색 변환용 캐릭터 음성(voice-dir)
            else:
                voices = list_say_voices()
            self._send_json({"voices": voices})
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

        def _qfloat(name, default):
            try:
                return float(qs.get(name, [str(default)])[0])
            except ValueError:
                return default

        rate = _qfloat("rate", 1.0)
        sdp_ratio = _qfloat("sdp_ratio", MELO_SDP_RATIO)
        noise_scale_w = _qfloat("noise_scale_w", MELO_NOISE_SCALE_W)
        if not text:
            self.send_response(400); self._cors(); self.end_headers()
            self.wfile.write(b"missing text")
            return

        try:
            audio = synthesize(text, voice, rate, sdp_ratio, noise_scale_w)
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
    p.add_argument("--backend", choices=["say", "melo"], default="say")
    p.add_argument("--voice", default="Yuna", help="say 백엔드 음성 (예: Yuna)")
    p.add_argument("--voice-convert", default=DEFAULT_MELO_VOICE,
                   help="melo 백엔드 OpenVoiceV2 음색 변환 기본 레퍼런스 "
                        "(기본: 티모 한국어 음성. UI 에서 음성 미선택 시 사용)")
    p.add_argument("--voice-dir", default=os.path.join(HERE, "..", "voice"),
                   help="melo 백엔드 음색 변환용 캐릭터 음성(mp3/wav) 디렉터리. "
                        "여기 파일들이 UI 음성 드롭다운에 뜬다")
    p.add_argument("--serve-dir", default=None,
                   help="정적 파일 디렉터리(chat-ui.html 위치). 지정하면 페이지+TTS를 한 서버에서 제공")
    p.add_argument("--stt-model", default="small",
                   help="faster-whisper STT 모델 (tiny/base/small/medium/large-v3). "
                        "POST /stt 첫 호출 시 지연 로딩(최초 1회 다운로드)")
    p.add_argument("--stt-warmup", action=argparse.BooleanOptionalAction, default=True,
                   help="서버 시작 시 faster-whisper 미리 로드/워밍업 "
                        "(기본 켜짐, --no-stt-warmup 으로 끔)")
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
        if ARGS.backend == "melo":
            ov_voices = [v["name"] for v in list_ov_voices()]
            if ov_voices:
                print("OpenVoiceV2 음색 변환 가능 음성(UI 드롭다운):")
                for n in ov_voices:
                    print("   -", n)
            try:
                load_openvoice()                       # 변환기 미리 로드
                if ARGS.voice_convert:                 # 기본 레퍼런스 음색도 미리 추출
                    print(f"기본 음색 미리 로드: {ARGS.voice_convert}")
                    get_tgt_se(resolve_reference(ARGS.voice_convert))
            except Exception as e:
                print("⚠️ OpenVoiceV2 로드 실패 → 변환 없이 melo 원본 사용:", e)
                ARGS.voice_convert = None
    if ARGS.stt_warmup:
        try:
            print(f"faster-whisper STT 워밍업({ARGS.stt_model})...")
            warmup_whisper()
            print("faster-whisper 워밍업 완료")
        except Exception as e:
            print("⚠️ STT 워밍업 건너뜀(첫 /stt 요청 때 로드):", e)

    srv = ThreadingHTTPServer((ARGS.host, ARGS.port), Handler)
    active_voice = (
        os.path.splitext(os.path.basename(ARGS.voice_convert))[0]
        if ARGS.backend == "melo" and ARGS.voice_convert
        else ARGS.voice
    )
    print(f"🔊 TTS 서버 시작: http://{ARGS.host}:{ARGS.port}  (backend={ARGS.backend}, voice={active_voice})")
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
