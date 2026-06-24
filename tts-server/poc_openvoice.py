"""melo(KR) 합성 → OpenVoiceV2 음색 변환 PoC.

melo 가 만든 한국어 음성을 데모 레퍼런스 화자의 음색으로 변조한다.
- 소스 SE: checkpoints_v2/base_speakers/ses/kr.pth (melo KR 화자 고정 임베딩)
- 타겟 SE: 데모 레퍼런스(mp3)에서 추출 (extract_se, whisper 불필요)
실행: tts-server/venv/bin/python tts-server/poc_openvoice.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "openvoice-src"))

import torch  # noqa: E402
from melo.api import TTS  # noqa: E402
from openvoice.api import ToneColorConverter  # noqa: E402

CKPT = os.path.join(HERE, "checkpoints_v2")
RES = os.path.join(HERE, "openvoice-src", "resources")
OUT = os.path.join(HERE, "poc_out")
os.makedirs(OUT, exist_ok=True)

TEXT = "안녕하세요, 오늘 기분이 어때요? 만나서 정말 반가워요."
REFS = ["demo_speaker0.mp3", "demo_speaker1.mp3", "demo_speaker2.mp3"]

device = "cpu"  # converter 는 작아서 CPU 로도 충분하고 MPS 호환 이슈 회피

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

# 3) 데모 레퍼런스별로 타겟 SE 추출 후 변환
for ref in REFS:
    ref_path = os.path.join(RES, ref)
    print(f"변환: {ref}")
    tgt_se = converter.extract_se(ref_path)
    out_path = os.path.join(OUT, f"converted_{ref.split('.')[0]}.wav")
    converter.convert(
        audio_src_path=base_wav,
        src_se=src_se,
        tgt_se=tgt_se,
        output_path=out_path,
    )
    print("  →", out_path)

print("\n완료. poc_out/ 의 base_melo.wav 와 converted_*.wav 를 비교해 들어보세요.")
