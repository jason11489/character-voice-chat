import json
import os
import re
from typing import Any

import httpx

from prompt import SYSTEM_PROMPT, build_user_prompt

ALLOWED_EMOTIONS = {"idle", "happy", "thinking", "concerned", "sleepy", "excited"}
ALLOWED_ACTIONS = {"idle", "nod", "shake_head", "wave", "explain", "thinking", "celebrate"}


def _demo_response(user_text: str, context: dict[str, Any]) -> dict[str, Any]:
    text = user_text.lower()

    if any(keyword in text for keyword in ["전기세", "전기요금", "돈", "절약"]):
        return {
            "text": "절약 모드로 바꿔볼게요. 다만 강아지가 있으면 에어컨을 완전히 끄지는 않는 게 좋아요.",
            "emotion": "concerned",
            "action": "explain",
            "cards": [
                {"title": "목표", "items": ["전기요금 절약", "불필요한 전력 사용 줄이기"]},
                {"title": "제약 조건", "items": ["강아지 있음", f"실내 온도 {context.get('indoor_temp', '알 수 없음')}°C"]},
                {"title": "추천 실행", "items": ["에어컨 26도", "에어타워 약풍", "대기전력 차단"]},
            ],
        }

    if any(keyword in text for keyword in ["조용", "쉬고", "피곤", "잠"]):
        return {
            "text": "조용한 모드로 바꿔볼게요. 청소기는 미루고, 조명과 알림을 차분하게 낮출게요.",
            "emotion": "sleepy",
            "action": "nod",
            "cards": [
                {"title": "사용자 상태", "items": ["휴식 선호", "소음 최소화"]},
                {"title": "실행 제안", "items": ["청소기 예약 연기", "조명 낮춤", "알림 최소화"]},
            ],
        }

    if any(keyword in text for keyword in ["불안", "무서", "걱정", "공황"]):
        return {
            "text": "괜찮아요. 주변 자극을 줄이고 편안한 환경으로 바꿔볼게요.",
            "emotion": "concerned",
            "action": "nod",
            "cards": [
                {"title": "감정 상태", "items": ["불안 신호", "자극 완화 필요"]},
                {"title": "환경 조정", "items": ["TV 소리 낮춤", "조명 부드럽게", "실내 온도 유지"]},
            ],
        }

    if any(keyword in text for keyword in ["왔어", "안녕", "하이", "반가"]):
        return {
            "text": "왔구나! 오늘 집 상태는 안정적이야.",
            "emotion": "happy",
            "action": "wave",
            "cards": [
                {"title": "홈 상태", "items": ["실내 상태 정상", "활성 기기 확인 완료"]},
            ],
        }

    return {
        "text": "좋아요. 집 상태를 확인하면서 가장 안전한 방법을 골라볼게요.",
        "emotion": "thinking",
        "action": "thinking",
        "cards": [
            {"title": "분석 중", "items": ["사용자 요청 해석", "집 상태 context 확인"]},
        ],
    }


def _extract_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in LLM output")

    return json.loads(match.group(0))


def _sanitize_response(data: dict[str, Any]) -> dict[str, Any]:
    emotion = data.get("emotion", "thinking")
    action = data.get("action", "thinking")

    if emotion not in ALLOWED_EMOTIONS:
        emotion = "thinking"

    if action not in ALLOWED_ACTIONS:
        action = "thinking"

    cards = data.get("cards") or []
    if not isinstance(cards, list):
        cards = []

    sanitized_cards = []
    for card in cards[:4]:
        if not isinstance(card, dict):
            continue

        title = str(card.get("title", "정보"))[:40]
        items = card.get("items", [])
        if not isinstance(items, list):
            items = [str(items)]

        sanitized_cards.append({
            "title": title,
            "items": [str(item)[:80] for item in items[:6]],
        })

    return {
        "text": str(data.get("text", "좋아요. 확인해볼게요."))[:240],
        "emotion": emotion,
        "action": action,
        "cards": sanitized_cards,
    }


async def _call_ollama(user_text: str, context: dict[str, Any]) -> dict[str, Any]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    model = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_user_prompt(user_text, context)},
        ],
        "options": {
            "temperature": 0.2,
        },
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        res = await client.post(f"{base_url}/api/chat", json=payload)
        res.raise_for_status()
        raw = res.json()

    content = raw.get("message", {}).get("content", "")
    parsed = _extract_json(content)
    return _sanitize_response(parsed)


async def generate_avatar_response(user_text: str, context: dict[str, Any]) -> dict[str, Any]:
    provider = os.getenv("LLM_PROVIDER", "mock").lower()

    if provider == "ollama":
        try:
            return await _call_ollama(user_text, context)
        except Exception as exc:
            # 데모 중 LLM 파싱/연결이 실패해도 화면이 죽지 않게 fallback
            fallback = _demo_response(user_text, context)
            fallback["cards"].insert(0, {
                "title": "LLM fallback",
                "items": [f"Ollama 호출 실패: {type(exc).__name__}"],
            })
            return fallback

    return _demo_response(user_text, context)