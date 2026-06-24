from __future__ import annotations

import io
import math
import os
import wave
from functools import lru_cache
from typing import Literal

import anyio

TTSProvider = Literal["mock", "qwen"]


def _provider() -> TTSProvider:
    provider = os.getenv("TTS_PROVIDER", "mock").lower()
    return "qwen" if provider == "qwen" else "mock"


def _mock_tts_wav(text: str) -> bytes:
    sample_rate = 24_000
    duration = min(8.0, max(1.1, len(text) * 0.055))
    total = int(sample_rate * duration)
    phrase_speed = 9.5
    base_freq = 460.0

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
      wav.setnchannels(1)
      wav.setsampwidth(2)
      wav.setframerate(sample_rate)

      frames = bytearray()
      for i in range(total):
          t = i / sample_rate
          syllable_gate = 0.35 + 0.65 * max(0.0, math.sin(t * phrase_speed * math.pi))
          envelope = min(1.0, t / 0.08) * min(1.0, (duration - t) / 0.12)
          wobble = math.sin(t * 2.7) * 32.0
          value = math.sin(2 * math.pi * (base_freq + wobble) * t)
          overtone = 0.35 * math.sin(2 * math.pi * (base_freq * 1.98) * t)
          sample = int((value + overtone) * syllable_gate * envelope * 7200)
          frames += sample.to_bytes(2, byteorder="little", signed=True)

      wav.writeframes(frames)

    return buffer.getvalue()


def _torch_dtype():
    import torch

    dtype = os.getenv("TTS_DTYPE", "bfloat16").lower()
    if dtype == "float16":
        return torch.float16
    if dtype == "float32":
        return torch.float32
    return torch.bfloat16


@lru_cache(maxsize=1)
def _load_qwen_model():
    from qwen_tts import Qwen3TTSModel

    kwargs = {
        "device_map": os.getenv("TTS_DEVICE", "cuda:0"),
        "dtype": _torch_dtype(),
    }

    attn = os.getenv("TTS_ATTN_IMPLEMENTATION", "").strip()
    if attn:
        kwargs["attn_implementation"] = attn

    return Qwen3TTSModel.from_pretrained(
        os.getenv("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
        **kwargs,
    )


def _qwen_tts_wav(text: str, language: str, ref_audio: str | None, ref_text: str | None) -> bytes:
    import soundfile as sf

    ref_audio = ref_audio or os.getenv("TTS_REF_AUDIO")
    ref_text = ref_text or os.getenv("TTS_REF_TEXT")

    if not ref_audio or not ref_text:
        raise ValueError("Qwen TTS requires TTS_REF_AUDIO and TTS_REF_TEXT, or request ref_audio/ref_text.")

    model = _load_qwen_model()
    wavs, sample_rate = model.generate_voice_clone(
        text=text,
        language=language or os.getenv("TTS_LANGUAGE", "Korean"),
        ref_audio=ref_audio,
        ref_text=ref_text,
    )

    buffer = io.BytesIO()
    sf.write(buffer, wavs[0], sample_rate, format="WAV")
    return buffer.getvalue()


async def synthesize_speech(
    text: str,
    language: str = "Korean",
    ref_audio: str | None = None,
    ref_text: str | None = None,
) -> tuple[bytes, str]:
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("text is empty")

    if _provider() == "qwen":
        audio = await anyio.to_thread.run_sync(_qwen_tts_wav, cleaned, language, ref_audio, ref_text)
        return audio, "audio/wav"

    audio = await anyio.to_thread.run_sync(_mock_tts_wav, cleaned)
    return audio, "audio/wav"


def tts_status() -> dict[str, str]:
    return {
        "provider": _provider(),
        "model": os.getenv("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
        "language": os.getenv("TTS_LANGUAGE", "Korean"),
    }
