"""Compatibility shim: route `import wandb` to Tahuna monitor MVP."""

from __future__ import annotations

from tahuna import monitor as _monitor

__version__ = _monitor.__version__

init = _monitor.init
log = _monitor.log
finish = _monitor.finish


def __getattr__(name: str):
    if name in {"run", "config", "Run", "Config"}:
        return getattr(_monitor, name)
    raise AttributeError(f"module 'wandb' has no attribute '{name}'")


__all__ = [
    "__version__",
    "Config",
    "Run",
    "config",
    "finish",
    "init",
    "log",
    "run",
]

