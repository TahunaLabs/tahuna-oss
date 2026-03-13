"""Compatibility shim: route `import wandb` to Tahuna monitor MVP."""

from __future__ import annotations

from tahuna import monitor as _monitor


class Error(Exception):
    pass


class UsageError(Error):
    pass


class CommError(Error):
    pass


class _DataType:
    def __init__(self, *args, **kwargs):  # noqa: D401, ANN002, ANN003
        self.args = args
        self.kwargs = kwargs


class Image(_DataType):
    pass


class Table(_DataType):
    pass


class Histogram(_DataType):
    pass


class Audio(_DataType):
    pass


class Video(_DataType):
    pass


__version__ = _monitor.__version__

init = _monitor.init
log = _monitor.log
finish = _monitor.finish
join = _monitor.join
define_metric = _monitor.define_metric
watch = _monitor.watch
unwatch = _monitor.unwatch
login = _monitor.login
setup = _monitor.setup
require = _monitor.require
alert = _monitor.alert
save = _monitor.save
use_artifact = _monitor.use_artifact


def termlog(message: str) -> None:
    print(message)


def termwarn(message: str) -> None:
    print(message)


def termerror(message: str) -> None:
    print(message)


def __getattr__(name: str):
    if name in {"run", "config", "summary", "Run", "Config", "Settings", "AlertLevel"}:
        return getattr(_monitor, name)
    raise AttributeError(f"module 'wandb' has no attribute '{name}'")


__all__ = [
    "__version__",
    "CommError",
    "Config",
    "Error",
    "Histogram",
    "Image",
    "Run",
    "Settings",
    "Table",
    "Audio",
    "Video",
    "AlertLevel",
    "UsageError",
    "alert",
    "config",
    "define_metric",
    "finish",
    "init",
    "join",
    "log",
    "login",
    "require",
    "run",
    "setup",
    "summary",
    "termerror",
    "termlog",
    "termwarn",
    "save",
    "use_artifact",
    "unwatch",
    "watch",
]
