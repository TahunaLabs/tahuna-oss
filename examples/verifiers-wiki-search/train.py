from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "configs" / "vf-rl" / "wiki-search.toml"


def main() -> int:
    if importlib.util.find_spec("verifiers_rl") is None:
        print(
            "RL training dependencies are not installed. "
            "Use `uv sync --group train` on a Linux GPU machine. "
            "Use `python eval.py` locally.",
            file=sys.stderr,
        )
        return 2
    return subprocess.run(["vf-rl", "@", str(CONFIG)], cwd=ROOT, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
