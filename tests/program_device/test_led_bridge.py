"""
program_device / led_bridge 단위 테스트.

요구사항 매핑(요구사항_명세서.md):
  R-07  응답 action 에 따른 동작 트리거 — 홈솔루션 devices → 물리 LED 제어로 실행
  R-12  ThinQ 연동(또는 시뮬레이션) 가전 제어 — 가전 상태를 LED on/off 로 반영

외부 의존성(requests 를 통한 Pi HTTP 호출)은 send_to_pi 를 가로채(monkeypatch)
실제 네트워크 없이 변환 로직만 검증한다.
"""
import importlib.util
import pathlib

import pytest

# src/program_device/led_bridge.py 를 파일 경로로 로드(모듈명에 하이픈/경로 이슈 회피)
_MODULE_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "src" / "program_device" / "led_bridge.py"
)
_spec = importlib.util.spec_from_file_location("led_bridge", _MODULE_PATH)
led_bridge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(led_bridge)


@pytest.mark.parametrize("state,expected", [
    ("on", "on"),
    ("active", "on"),
    ("start", "on"),
    ("off", "off"),
    ("idle", "off"),
    ("", "off"),
    ("아무거나", "off"),
])
def test_R12_normalize_state(state, expected):
    """R-12: on/active/start 만 'on', 나머지는 모두 'off' 로 정규화."""
    assert led_bridge.normalize_state(state) == expected


def test_R12_device_to_led_mapping():
    """R-12: LED 가 연결된 6개 가전만 매핑되어 있어야 한다."""
    assert led_bridge.DEVICE_TO_LED == {
        "TV": "A",
        "스피커": "B",
        "조명": "C",
        "로봇청소기": "D",
        "공기청정기": "E",
        "워시타워": "F",
    }


def test_R12_handle_llm_output_builds_commands(monkeypatch):
    """R-12: 홈솔루션 devices → LED 명령 리스트로 변환, 미매핑 가전은 무시."""
    sent = {}
    monkeypatch.setattr(led_bridge, "send_to_pi", lambda cmds: sent.setdefault("cmds", cmds))

    llm_json = {
        "homeSolution": {
            "devices": [
                {"name": "TV", "state": "on"},
                {"name": "스피커", "state": "off"},
                {"name": "조명", "state": "active"},
                {"name": "정수기", "state": "on"},   # LED 없음 → 무시
            ]
        }
    }
    led_bridge.handle_llm_output(llm_json)

    assert {(c["led"], c["state"]) for c in sent["cmds"]} == {
        ("A", "on"),
        ("B", "off"),
        ("C", "on"),
    }


def test_R12_handle_llm_output_no_controllable_device(monkeypatch):
    """R-12: 제어할 LED 가 하나도 없으면 Pi 로 전송하지 않는다."""
    called = {"n": 0}
    monkeypatch.setattr(led_bridge, "send_to_pi", lambda cmds: called.__setitem__("n", called["n"] + 1))

    led_bridge.handle_llm_output({"homeSolution": {"devices": [{"name": "정수기", "state": "on"}]}})
    led_bridge.handle_llm_output({})  # homeSolution 자체가 없어도 안전

    assert called["n"] == 0
