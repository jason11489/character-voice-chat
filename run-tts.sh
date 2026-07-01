#!/bin/sh
# TTS 서버 ② 를 melo 백엔드로 :8080 에서 실행한다.
# 사용법: ./run-tts.sh            (기본: melo, 포트 8080)
#         ./run-tts.sh --port 9000 --backend say   (인자는 그대로 전달됨)
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$HERE/src/program_backend"
PY="$BACKEND/venv/bin/python"

if [ ! -x "$PY" ]; then
  echo "venv가 없습니다. RUN.md의 '최초 1회 설치 > TTS' 를 먼저 진행하세요." >&2
  exit 1
fi

# 기본값(melo, :8080). 추가/덮어쓰기 인자는 그대로 전달.
# --serve-dir: 통합 배포 시 프론트엔드 빌드 산출물(index.html)을 같은 서버에서 서빙.
exec "$PY" "$BACKEND/macos-tts-server.py" \
  --backend melo --port 8080 --serve-dir "$HERE/src/program_frontend/dist" "$@"
