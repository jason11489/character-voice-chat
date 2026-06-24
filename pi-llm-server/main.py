from __future__ import annotations

import os
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llm import generate_avatar_response
from tts import synthesize_speech, tts_status

load_dotenv()

Emotion = Literal["idle", "happy", "thinking", "concerned", "sleepy", "excited"]
Action = Literal["idle", "nod", "shake_head", "wave", "explain", "thinking", "celebrate"]


class ChatRequest(BaseModel):
    user_text: str = Field(..., min_length=1)
    context: dict = Field(default_factory=dict)


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    language: str = Field(default="Korean")
    ref_audio: Optional[str] = None
    ref_text: Optional[str] = None


class Card(BaseModel):
    title: str
    items: list[str]


class AvatarResponse(BaseModel):
    text: str
    emotion: Emotion
    action: Action
    cards: list[Card] = Field(default_factory=list)


app = FastAPI(title="HomeBot Pi LLM Server")

allow_origins = os.getenv("ALLOW_ORIGINS", "*")
origins = ["*"] if allow_origins == "*" else [x.strip() for x in allow_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "provider": os.getenv("LLM_PROVIDER", "mock"),
        "tts": tts_status(),
    }


@app.post("/chat", response_model=AvatarResponse)
async def chat(req: ChatRequest):
    return await generate_avatar_response(req.user_text, req.context)


@app.get("/tts/health")
async def tts_health():
    return {
        "status": "ok",
        **tts_status(),
    }


@app.post("/tts")
async def tts(req: TTSRequest):
    try:
        audio, media_type = await synthesize_speech(
            text=req.text,
            language=req.language,
            ref_audio=req.ref_audio,
            ref_text=req.ref_text,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"TTS failed: {type(exc).__name__}: {exc}") from exc

    return Response(
        content=audio,
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )
