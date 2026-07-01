"""melo(KR) 합성 → OpenVoiceV2 음색 변환 (아냐 레퍼런스).

레퍼런스: voice/스파이패밀리 아냐 목소리 대사 모음.mp3
실행: tts-server/venv/bin/python tts-server/poc_anya.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "openvoice-src"))

import torch  # noqa: E402
from melo.api import TTS  # noqa: E402
from openvoice.api import ToneColorConverter  # noqa: E402

CKPT = os.path.join(HERE, "checkpoints_v2")
OUT = os.path.join(HERE, "poc_out")
# 레퍼런스: 인자로 경로를 주면 그걸, 없으면 기본(대사 모음).
DEFAULT_REF = os.path.join(HERE, "..", "voice", "스파이패밀리 아냐 목소리 대사 모음.mp3")
REF = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REF
TAG = os.path.splitext(os.path.basename(REF))[0][:20]
os.makedirs(OUT, exist_ok=True)

TEXT = "안녕하세요, 오늘 기분이 어때요? 만나서 정말 반가워요."
device = "cpu"

# 1) melo 로 KR 베이스 음성 생성
print("melo 로드/합성...")
melo = TTS(language="KR", device="auto")
spk_id = list(melo.hps.data.spk2id.values())[0]
base_wav = os.path.join(OUT, "base_melo.wav")
melo.tts_to_file(TEXT, spk_id, base_wav, speed=1.0, quiet=True)
print("  베이스:", base_wav)

# 2) OpenVoice 변환기 + 소스 SE 로드
print("ToneColorConverter 로드...")
converter = ToneColorConverter(
    os.path.join(CKPT, "converter", "config.json"), device=device
)
converter.load_ckpt(os.path.join(CKPT, "converter", "checkpoint.pth"))
src_se = torch.load(
    os.path.join(CKPT, "base_speakers", "ses", "kr.pth"), map_location=device
)

# 3) 아냐 레퍼런스에서 타겟 SE 추출 후 변환
print(f"아냐 SE 추출... ({os.path.basename(REF)})")
tgt_se = converter.extract_se(REF)
out_path = os.path.join(OUT, f"converted_{TAG}.wav")
converter.convert(
    audio_src_path=base_wav,
    src_se=src_se,
    tgt_se=tgt_se,
    output_path=out_path,
)
print("  →", out_path)
print(f"\n완료. {os.path.basename(out_path)} 를 들어보세요.")
