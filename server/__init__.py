"""Trading Cards: Print Shop server package."""

import os
from pathlib import Path


def load_local_env():
    path = Path(__file__).resolve().parent.parent / ".env"
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.isidentifier():
            os.environ.setdefault(key, value.strip().strip('"\''))


load_local_env()
