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


@dataclass
class Run:
    _client: RuntimeClient
    project: str | None = None
    name: str | None = None
    config: Config = field(default_factory=Config)
    _finished: bool = False

    def log(
        self,
        data: Mapping[str, Any],
        step: int | None = None,
        commit: bool | None = None,  # noqa: ARG002
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


def init(
    *,
    project: str | None = None,
    name: str | None = None,
    config: Mapping[str, Any] | None = None,
    **kwargs: Any,  # noqa: ARG001
) -> Run:
    global run
    global _ATEXIT_REGISTERED

    with _LOCK:
        if run is not None and not run._finished:
            raise RuntimeError("tahuna.monitor only supports one active run per process")

        runtime_client = RuntimeClient.from_env()
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

        run = Run(
            _client=runtime_client,
            project=project,
            name=name,
            config=next_config,
        )
        globals()["config"] = run.config
        run._emit_init_event()

        if not _ATEXIT_REGISTERED:
            atexit.register(_finish_at_exit)
            _ATEXIT_REGISTERED = True

        return run


def log(
    data: Mapping[str, Any],
    step: int | None = None,
    commit: bool | None = None,
) -> None:
    if run is None:
        raise RuntimeError("tahuna.monitor.log called before tahuna.monitor.init")
    run.log(data, step=step, commit=commit)


def finish(
    *,
    exit_code: int | None = None,
    quiet: bool | None = None,  # noqa: ARG001
) -> None:
    global run
    with _LOCK:
        if run is None:
            return
        run.finish(exit_code=exit_code)
        run = None


def _finish_at_exit() -> None:
    try:
        finish()
    except Exception:
        # Exit cleanup should not crash user jobs.
        pass


__all__ = [
    "Config",
    "Run",
    "config",
    "finish",
    "init",
    "log",
    "run",
]
