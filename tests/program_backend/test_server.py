"""
program_backend / macos-tts-server HTTP 라우트 단위 테스트.

요구사항 매핑:
  R-01  음성 입력(STT)      — POST /stt : 오디오 바이트 → 한국어 텍스트
  R-05  음성 합성(TTS)      — GET  /tts : text → WAV 오디오, 쿼리 파라미터 파싱
  R-05  음색 목록           — GET  /voices : voice-dir 의 캐릭터 음성 목록
  R-05  서버 상태(health)   — GET  /health : 백엔드/프로소디/STT 모델 상태
  R-17  통합 정적 서빙/보안 — 한 서버가 UI(정적)+API 서빙, 경로 탈출 방지, CORS

무거운 모델(MeloTTS/faster-whisper)은 synthesize/transcribe 를 가로채(monkeypatch)
로드하지 않고, 실제 Handler·라우팅·쿼리파싱·정적서빙만 검증한다.
"""
import argparse
import http.client
import importlib.util
import pathlib
import threading
from http.server import ThreadingHTTPServer

import pytest

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_MODULE_PATH = _ROOT / "src" / "program_backend" / "macos-tts-server.py"
_VOICE_DIR = _ROOT / "src" / "program_backend" / "voice"

_spec = importlib.util.spec_from_file_location("tts_server", _MODULE_PATH)
tts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tts)

# synthesize 마지막 호출 인자를 담아 검증
CAP = {}


@pytest.fixture(scope="module")
def server(tmp_path_factory):
    serve_dir = tmp_path_factory.mktemp("serve")
    (serve_dir / "index.html").write_text("<html>HOME</html>", encoding="utf-8")
    (serve_dir / "app.js").write_text("console.log(1)", encoding="utf-8")

    tts.ARGS = argparse.Namespace(
        backend="melo",
        voice="Yuna",
        voice_convert=str(_VOICE_DIR / "티모 2024 한국어 음성 (Teemo 2024 Korean Voice).mp3"),
        voice_dir=str(_VOICE_DIR),
        serve_dir=str(serve_dir),
        stt_model="tiny",
    )

    def fake_synth(text, voice, rate, sdp_ratio, noise_scale_w):
        CAP.update(text=text, voice=voice, rate=rate,
                   sdp_ratio=sdp_ratio, noise_scale_w=noise_scale_w)
        return b"RIFFWAVEDATA"

    tts.synthesize = fake_synth
    tts.transcribe = lambda data: "안녕하세요"

    srv = ThreadingHTTPServer(("127.0.0.1", 0), tts.Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield srv.server_address, serve_dir
    srv.shutdown()


def _conn(server):
    host, port = server[0]
    return http.client.HTTPConnection(host, port, timeout=5)


def _get(server, path):
    c = _conn(server)
    c.request("GET", path)
    r = c.getresponse()
    body = r.read()
    c.close()
    return r, body


# ----------------------------- R-05 health -----------------------------
def test_R05_health(server):
    r, body = _get(server, "/health")
    assert r.status == 200
    assert r.getheader("Content-Type") == "application/json"
    import json
    data = json.loads(body)
    assert data["ok"] is True
    assert data["backend"] == "melo"
    assert data["melo_sdp_ratio"] == 0.6
    assert data["melo_noise_scale_w"] == 1.0
    assert data["stt_model"] == "tiny"
    assert data["cached_sentences"] == 0


# ----------------------------- R-05 voices -----------------------------
def test_R05_voices_lists_character_audio(server):
    r, body = _get(server, "/voices")
    assert r.status == 200
    import json
    voices = json.loads(body)["voices"]
    names = {v["name"] for v in voices}
    # voice 폴더의 실제 캐릭터 음성(mp3) stem 이 노출되어야 한다
    assert any("Teemo" in n or "티모" in n for n in names)
    assert all(v["lang"] == "ko" for v in voices)
    assert len(voices) >= 3


# ------------------------------ R-05 tts -------------------------------
def test_R05_tts_synthesizes_wav_with_parsed_params(server):
    r, body = _get(server, "/tts?text=%EC%95%88%EB%85%95&rate=1.5&sdp_ratio=0.7&noise_scale_w=0.9")
    assert r.status == 200
    assert r.getheader("Content-Type") == "audio/wav"
    assert body == b"RIFFWAVEDATA"
    # 쿼리 파라미터가 그대로 합성 함수로 전달되었는가
    assert CAP["text"] == "안녕"
    assert CAP["rate"] == 1.5
    assert CAP["sdp_ratio"] == 0.7
    assert CAP["noise_scale_w"] == 0.9


def test_R05_tts_defaults_prosody_when_absent(server):
    _get(server, "/tts?text=hi")
    assert CAP["sdp_ratio"] == 0.6   # MELO_SDP_RATIO 기본
    assert CAP["noise_scale_w"] == 1.0
    assert CAP["rate"] == 1.0


def test_R05_tts_missing_text_returns_400(server):
    r, body = _get(server, "/tts")
    assert r.status == 400
    assert b"missing text" in body


# ------------------------------ R-01 stt -------------------------------
def test_R01_stt_transcribes_audio(server):
    c = _conn(server)
    c.request("POST", "/stt", body=b"\x00\x01fakeaudio")
    r = c.getresponse()
    import json
    data = json.loads(r.read())
    c.close()
    assert r.status == 200
    assert data["text"] == "안녕하세요"


def test_R01_stt_empty_body_returns_400(server):
    c = _conn(server)
    c.request("POST", "/stt", body=b"")
    r = c.getresponse()
    body = r.read()
    c.close()
    assert r.status == 400
    assert b"missing audio" in body


# ------------------------ R-17 정적 서빙 / 보안 ------------------------
def test_R17_serves_spa_index_at_root(server):
    r, body = _get(server, "/")
    assert r.status == 200
    assert b"HOME" in body


def test_R17_serves_js_with_module_mime(server):
    r, body = _get(server, "/app.js")
    assert r.status == 200
    assert "text/javascript" in r.getheader("Content-Type")


def test_R17_path_traversal_is_blocked(server):
    # serve-dir 밖(/etc/hosts)으로 탈출 시도 → 유출 없이 index.html 로 폴백
    r, body = _get(server, "/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/hosts")
    assert r.status == 200
    assert b"HOME" in body
    assert b"localhost" not in body  # /etc/hosts 내용이 새지 않았는지


def test_R17_cors_preflight(server):
    c = _conn(server)
    c.request("OPTIONS", "/tts")
    r = c.getresponse()
    r.read()
    c.close()
    assert r.status == 204
    assert r.getheader("Access-Control-Allow-Origin") == "*"


def test_R17_unknown_post_path_404(server):
    c = _conn(server)
    c.request("POST", "/nope")
    r = c.getresponse()
    r.read()
    c.close()
    assert r.status == 404
