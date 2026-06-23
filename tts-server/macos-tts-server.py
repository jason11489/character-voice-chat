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
import shlex
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ARGS = None
MELO_TTS = None          # MeloTTS 모델 (지연 로딩)
MELO_SPEAKER = None
MELO_LOCK = threading.Lock()

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


def synth_melo(text: str, rate: float) -> bytes:
    import soundfile as sf  # type: ignore
    with MELO_LOCK:
        load_melo()
        spk = list(MELO_SPEAKER.values())[0]
        with tempfile.TemporaryDirectory() as d:
            wav = os.path.join(d, "out.wav")
            # speed: 1.0 기준, UI rate 그대로 사용
            MELO_TTS.tts_to_file(text, spk, wav, speed=float(rate), quiet=True)
            with open(wav, "rb") as f:
                return f.read()


def synthesize(text: str, voice: str, rate: float) -> bytes:
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
            self._send_json({"ok": True, "backend": ARGS.backend, "voice": ARGS.voice})
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
    p.add_argument("--backend", choices=["say", "melo"], default="say")
    p.add_argument("--voice", default="Yuna", help="say 백엔드 음성 (예: Yuna)")
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
    else:
        print("MeloTTS 백엔드: 모델을 미리 로드합니다(최초 수십 초 소요, 이후 문장당 ~1초)...")
        try:
            load_melo()
        except Exception as e:
            print("⚠️ MeloTTS 로드 실패 → say 로 폴백:", e)
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
