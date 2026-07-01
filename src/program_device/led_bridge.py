import requests
import json

# 라즈베리파이 IP (수정 필요)
LED_PI_URL = "http://10.56.131.40:5000/led"

# LED 연결된 6개만 사용
DEVICE_TO_LED = {
    "TV": "A",
    "스피커": "B",
    "조명": "C",
    "로봇청소기": "D",
    "공기청정기": "E",
    "워시타워": "F"
}

def normalize_state(state):
    if state in ["on", "active", "start"]:
        return "on"
    return "off"


def handle_llm_output(llm_json):
    devices = llm_json.get("homeSolution", {}).get("devices", [])

    led_state_map = {}

    for d in devices:
        name = d.get("name")
        state = d.get("state")

        led = DEVICE_TO_LED.get(name)
        if not led:
            print(f"[SKIP] {name} (LED 없음)")
            continue

        led_state_map[led] = normalize_state(state)

    if not led_state_map:
        print("[INFO] 제어할 LED 없음")
        return

    commands = [
        {"led": led, "state": state}
        for led, state in led_state_map.items()
    ]

    send_to_pi(commands)


def send_to_pi(commands):
    try:
        res = requests.post(
            LED_PI_URL,
            json={"commands": commands},
            timeout=1
        )
        print(f"[SEND] {commands} -> {res.status_code}")
    except Exception as e:
        print(f"[ERROR] Pi 연결 실패: {e}")


def check_connection():
    try:
        res = requests.get(LED_PI_URL.replace("/led", "/health"), timeout=1)
        print("[CHECK]", res.json())
    except Exception as e:
        print("[CHECK ERROR]", e)


if __name__ == "__main__":
    check_connection()

    test_data = {
        "text": "여러 가전 제어",
        "homeSolution": {
            "devices": [
                {"name": "TV", "state": "on"},
                {"name": "스피커", "state": "off"},
                {"name": "조명", "state": "on"},
                {"name": "공기청정기", "state": "on"},
                {"name": "정수기", "state": "on"}  # 무시됨 (LED 없음)
            ]
        }
    }

    handle_llm_output(test_data)
