#!/bin/sh
# git 에 올리지 않는 대용량 런타임 자산(~780MB)을 clone 후 1회 실행으로 복원한다.
#   - OpenVoice 소스(openvoice-src)         : github 클론
#   - OpenVoice V2 체크포인트(checkpoints_v2): HuggingFace 미러
#   - MeloTTS 한국어 HF 모델                  : 캐시 prefetch(서버가 오프라인 모드라 필수)
#
# 선행조건: tts-server/venv 생성 + requirements-melo.txt 설치(huggingface_hub 필요).
# 사용법:  sh tts-server/fetch-models.sh
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"      # .../tts-server
PY="$HERE/venv/bin/python"

if [ ! -x "$PY" ]; then
  echo "venv가 없습니다. 먼저 venv 생성 + requirements-melo.txt 설치하세요." >&2
  exit 1
fi

# 1) OpenVoice 소스 (서버가 openvoice.api 를 import)
if [ -f "$HERE/openvoice-src/openvoice/api.py" ]; then
  echo "[skip] openvoice-src 이미 있음"
else
  echo "[get] OpenVoice 소스 clone..."
  git clone --depth 1 https://github.com/myshell-ai/OpenVoice.git "$HERE/openvoice-src"
fi

# 2) OpenVoice V2 체크포인트 (공식 S3 zip 은 현재 404 → HuggingFace 미러 사용)
if [ -f "$HERE/checkpoints_v2/converter/checkpoint.pth" ]; then
  echo "[skip] OpenVoice 체크포인트 이미 있음"
else
  echo "[get] OpenVoice V2 체크포인트 다운로드 (HF: myshell-ai/OpenVoiceV2)..."
  "$PY" - "$HERE" <<'PYEOF'
import sys
from huggingface_hub import snapshot_download
snapshot_download("myshell-ai/OpenVoiceV2", local_dir=sys.argv[1] + "/checkpoints_v2")
PYEOF
fi
test -f "$HERE/checkpoints_v2/converter/checkpoint.pth" || { echo "ERROR: converter/checkpoint.pth 없음"; exit 1; }
test -f "$HERE/checkpoints_v2/base_speakers/ses/kr.pth" || { echo "ERROR: base_speakers/ses/kr.pth 없음"; exit 1; }
echo "[ok] OpenVoice 준비됨"

# 3) MeloTTS 한국어 HF 모델 prefetch (서버가 HF_HUB_OFFLINE=1 로 켜지므로 미리 캐시에 받아둔다)
echo "[get] MeloTTS 한국어 HF 모델 prefetch..."
"$PY" - <<'PYEOF'
from huggingface_hub import snapshot_download
for repo in ("myshell-ai/MeloTTS-Korean", "kykim/bert-kor-base"):
    print("  downloading", repo)
    snapshot_download(repo)
PYEOF
echo "[ok] HF 모델 캐시 준비됨"

echo
echo "완료. 실행:"
echo "  venv/bin/python tts-server/macos-tts-server.py --backend melo --serve-dir virtual-avatar/dist --port 8080"
