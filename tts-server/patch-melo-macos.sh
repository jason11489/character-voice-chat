#!/bin/sh
set -eu

SITE_PACKAGES="$(
  "$(dirname "$0")/venv/bin/python" -c \
    'import site; print(site.getsitepackages()[0])'
)"
CLEANER="$SITE_PACKAGES/melo/text/cleaner.py"
TEXT_INIT="$SITE_PACKAGES/melo/text/__init__.py"
PIP="$(dirname "$0")/venv/bin/pip"

"$PIP" uninstall -y mecab-python3
"$PIP" install --force-reinstall --no-deps python-mecab-ko python-mecab-ko-dic

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
