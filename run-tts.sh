#!/bin/sh
# 프론트 빌드 + STT/TTS/UI 통합 서버를 한 번에 :8080 에서 실행한다.
# 사용법: ./run-tts.sh                    (프론트 dist 없으면 자동 빌드 후 기동)
#         ./run-tts.sh --profile laptop   (인자는 서버로 그대로 전달)
#         ./run-tts.sh --build            (프론트 강제 재빌드 후 기동)
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$HERE/src/program_backend"
FRONTEND="$HERE/src/program_frontend"
PY="$BACKEND/venv/bin/python"

# --build 를 서버 인자에서 분리하고 나머지는 순서/따옴표 보존해 그대로 전달.
BUILD=0
count=$#
while [ "$count" -gt 0 ]; do
  arg="$1"; shift
  if [ "$arg" = "--build" ]; then BUILD=1; else set -- "$@" "$arg"; fi
  count=$((count - 1))
done

if [ ! -x "$PY" ]; then
  echo "venv가 없습니다. RUN.md의 '최초 1회 설치 > TTS' 를 먼저 진행하세요." >&2
  exit 1
fi

# 프론트 빌드: dist 가 없거나 --build 지정 시 (UI 코드 바뀌면 --build 로 갱신)
if [ "$BUILD" = "1" ] || [ ! -f "$FRONTEND/dist/index.html" ]; then
  echo "▶ 프론트 빌드 (npm run build)…"
  (cd "$FRONTEND" && npm run build)
fi

# 한 프로세스가 STT + TTS + UI 를 같은 :8080 에서 서빙.
exec "$PY" "$BACKEND/macos-tts-server.py" \
  --backend melo --port 8080 --serve-dir "$FRONTEND/dist" "$@"
