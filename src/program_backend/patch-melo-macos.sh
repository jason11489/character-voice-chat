#!/bin/sh
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
# 활성화된 venv(.venv 등)가 있으면 그걸, 없으면 tts-server/venv 를 쓴다.
if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "$VIRTUAL_ENV/bin/python" ]; then
  PY="$VIRTUAL_ENV/bin/python"
elif [ -x "$HERE/venv/bin/python" ]; then
  PY="$HERE/venv/bin/python"
else
  echo "venv를 못 찾음. 'source .venv/bin/activate' 후 다시 실행하세요." >&2
  exit 1
fi

SITE_PACKAGES="$("$PY" -c 'import site; print(site.getsitepackages()[0])')"
CLEANER="$SITE_PACKAGES/melo/text/cleaner.py"
TEXT_INIT="$SITE_PACKAGES/melo/text/__init__.py"

"$PY" -m pip uninstall -y mecab-python3
"$PY" -m pip install --force-reinstall --no-deps python-mecab-ko python-mecab-ko-dic

sed -i '' \
  '1s/.*/from . import korean/' \
  "$CLEANER"

perl -0pi -e \
  "s/language_module_map = .*?\\n\\n/language_module_map = {'KR': korean}\\n\\n/s" \
  "$CLEANER"

perl -0pi -e \
  's/def get_bert\(.*?\n    return bert\n/def get_bert(norm_text, word2ph, language, device):\n    from .korean import get_bert_feature as kr_bert\n\n    if language != "KR":\n        raise NotImplementedError("This macOS setup is configured for Korean only.")\n    return kr_bert(norm_text, word2ph, device)\n/s' \
  "$TEXT_INIT"

echo "Patched MeloTTS for Korean-only use on case-insensitive macOS."
