"""Minimal W&B-compatible Tahuna monitor SDK (MVP)."""

from __future__ import annotations

import atexit
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ._runtime import RuntimeClient
from ._sanitize import (
    coerce_config_value,
    coerce_metric_value,
    is_sensitive_key,
    sanitize_message,
)

__version__ = "0.1.0"
_SOURCE = "monitor"
_LOCK = threading.RLock()
_ATEXIT_REGISTERED = False


class Config(dict):
    """Minimal config container to mirror wandb.config usage."""

    def update(  # type: ignore[override]
        self,
        other: Mapping[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        allow_val_change = bool(kwargs.pop("allow_val_change", False))  # noqa: F841
        if other:
            for raw_key, raw_value in other.items():
                key = str(raw_key).strip()
                if not key or is_sensitive_key(key):
                    continue
                value = coerce_config_value(raw_value)
                if value is None:
                    continue
                super().__setitem__(key[:120], value)
        if kwargs:
            for raw_key, raw_value in kwargs.items():
                key = str(raw_key).strip()
                if not key or is_sensitive_key(key):
                    continue
                value = coerce_config_value(raw_value)
                if value is None:
                    continue
                super().__setitem__(key[:120], value)


class Summary(dict):
    """Minimal summary container."""


class Settings(dict):
    """Compatibility placeholder for wandb.Settings."""


class AlertLevel:
    INFO = "INFO"
    WARN = "WARN"
    ERROR = "ERROR"


@dataclass
class Run:
    _client: RuntimeClient
    id: str
    project: str | None = None
    name: str | None = None
    config: Config = field(default_factory=Config)
    summary: Summary = field(default_factory=Summary)
    _finished: bool = False

    def log(
        self,
        data: Mapping[str, Any],
        step: int | None = None,
        commit: bool | None = None,  # noqa: ARG002
        **kwargs: Any,  # noqa: ARG002
    ) -> None:
        if self._finished:
            raise RuntimeError("tahuna.monitor run is already finished")
        if not isinstance(data, Mapping):
            raise TypeError("tahuna.monitor.log expects a mapping of metric names to numeric values")

        timestamp = int(time.time() * 1000)
        metrics: list[dict[str, Any]] = []
        dropped_sensitive = 0
        dropped_non_numeric = 0

        for raw_name, raw_value in data.items():
            name = str(raw_name).strip()
            if not name:
                continue
            if is_sensitive_key(name):
                dropped_sensitive += 1
                continue
            value = coerce_metric_value(raw_value)
            if value is None:
                dropped_non_numeric += 1
                continue
            sample: dict[str, Any] = {
                "name": name[:120],
                "value": value,
                "source": _SOURCE,
                "timestamp": timestamp,
            }
            if step is not None:
                sample["step"] = int(step)
            metrics.append(sample)

        if metrics:
            self._client.emit_metrics(metrics)

        if dropped_sensitive or dropped_non_numeric:
            self._emit_event(
                "monitor.log dropped metrics "
                f"(sensitive={dropped_sensitive}, non_numeric={dropped_non_numeric})",
                level="warn",
            )

    def define_metric(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def watch(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def unwatch(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def save(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def _label(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def log_code(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def use_artifact(self, *args: Any, **kwargs: Any) -> None:  # noqa: ARG002
        return None

    def alert(self, title: str, text: str, level: str | None = None, **kwargs: Any) -> None:  # noqa: ARG002
        level_text = (level or "info").strip().lower() or "info"
        safe_title = sanitize_message(title, max_length=80)
        safe_text = sanitize_message(text, max_length=160)
        self._emit_event(f"monitor.alert title={safe_title} text={safe_text}", level=level_text)

    def finish(self, exit_code: int | None = None) -> None:
        if self._finished:
            return
        message = "monitor.finish"
        if exit_code is not None:
            message = f"{message} exit_code={int(exit_code)}"
        self._emit_event(message)
        self._finished = True

    def _emit_init_event(self) -> None:
        fields: list[str] = ["monitor.init"]
        if self.project:
            fields.append(f"project={sanitize_message(self.project, max_length=80)}")
        if self.name:
            fields.append(f"name={sanitize_message(self.name, max_length=80)}")
        if self.config:
            fields.append(f"config_keys={len(self.config)}")
        self._emit_event(" ".join(fields))

    def _emit_event(self, message: str, *, level: str = "info") -> None:
        safe_message = sanitize_message(message)
        if not safe_message:
            return
        self._client.emit_logs(
            [
                {
                    "message": safe_message,
                    "level": level,
                    "source": _SOURCE,
                    "timestamp": int(time.time() * 1000),
                }
            ]
        )


run: Run | None = None
config: Config = Config()
summary: Summary = Summary()
run_disabled: bool = False


def init(
    *,
    project: str | None = None,
    name: str | None = None,
    config: Mapping[str, Any] | None = None,
    **kwargs: Any,
) -> Run:
    global run
    global run_disabled
    global _ATEXIT_REGISTERED

    with _LOCK:
        reinit = bool(kwargs.get("reinit", False))
        if run is not None and not run._finished and not reinit:
            raise RuntimeError("tahuna.monitor only supports one active run per process")
        if run is not None and not run._finished and reinit:
            run.finish()

        runtime_client = RuntimeClient.from_env()
        run_disabled = False
        next_config = Config()
        if config is not None:
            if not isinstance(config, Mapping):
                raise TypeError("tahuna.monitor.init config must be a mapping")
            for raw_key, raw_value in config.items():
                key = str(raw_key).strip()
                if not key or is_sensitive_key(key):
                    continue
                value = coerce_config_value(raw_value)
                if value is None:
                    continue
                next_config[key[:120]] = value

        effective_name = name or runtime_client.run_id
        run = Run(
            _client=runtime_client,
            id=runtime_client.run_id,
            project=project,
            name=effective_name,
            config=next_config,
        )
        globals()["config"] = run.config
        globals()["summary"] = run.summary
        run._emit_init_event()

        if not _ATEXIT_REGISTERED:
            atexit.register(_finish_at_exit)
            _ATEXIT_REGISTERED = True

        return run


def log(
    data: Mapping[str, Any],
    step: int | None = None,
    commit: bool | None = None,
    **kwargs: Any,
) -> None:
    if run is None:
        raise RuntimeError("tahuna.monitor.log called before tahuna.monitor.init")
    run.log(data, step=step, commit=commit, **kwargs)


def finish(
    *,
    exit_code: int | None = None,
    quiet: bool | None = None,  # noqa: ARG001
) -> None:
    global run
    global run_disabled
    with _LOCK:
        if run is None:
            return
        run.finish(exit_code=exit_code)
        run = None
        run_disabled = False


join = finish


def define_metric(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.define_metric(*args, **kwargs)


def watch(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.watch(*args, **kwargs)


def unwatch(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.unwatch(*args, **kwargs)


def login(*args: Any, **kwargs: Any) -> bool:  # noqa: ARG002
    return True


def setup(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    return None


def require(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    return None


def alert(title: str, text: str, level: str | None = None, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.alert(title=title, text=text, level=level, **kwargs)


def save(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.save(*args, **kwargs)


def use_artifact(*args: Any, **kwargs: Any) -> None:  # noqa: ARG002
    if run is None:
        return None
    return run.use_artifact(*args, **kwargs)


def _finish_at_exit() -> None:
    try:
        finish()
    except Exception:
        # Exit cleanup should not crash user jobs.
        pass


__all__ = [
    "AlertLevel",
    "Config",
    "Run",
    "Settings",
    "alert",
    "config",
    "define_metric",
    "finish",
    "join",
    "init",
    "log",
    "login",
    "require",
    "run",
    "setup",
    "summary",
    "save",
    "use_artifact",
    "unwatch",
    "watch",
]
