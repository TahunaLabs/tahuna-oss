from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


class RuntimeClient:
    def __init__(
        self,
        *,
        base_url: str,
        run_id: str,
        token: str,
        timeout_seconds: float,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.run_id = run_id
        self.token = token
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "RuntimeClient":
        base_url = os.environ.get("TAHUNA_API_BASE", "").strip()
        run_id = os.environ.get("TAHUNA_RUN_ID", "").strip()
        token = os.environ.get("TAHUNA_RUNTIME_TOKEN", "").strip()

        missing: list[str] = []
        if not base_url:
            missing.append("TAHUNA_API_BASE")
        if not run_id:
            missing.append("TAHUNA_RUN_ID")
        if not token:
            missing.append("TAHUNA_RUNTIME_TOKEN")
        if missing:
            joined = ", ".join(missing)
            raise RuntimeError(
                f"tahuna.monitor requires runtime env vars: {joined}"
            )

        timeout_raw = os.environ.get("TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS", "10").strip()
        timeout_seconds = 10.0
        if timeout_raw:
            try:
                timeout_seconds = float(timeout_raw)
            except ValueError:
                timeout_seconds = 10.0
            if timeout_seconds <= 0:
                timeout_seconds = 10.0

        return cls(
            base_url=base_url,
            run_id=run_id,
            token=token,
            timeout_seconds=timeout_seconds,
        )

    def emit_logs(self, lines: list[dict[str, Any]]) -> int:
        payload = self._post("logs", {"lines": lines})
        return int(payload.get("accepted", 0))

    def emit_metrics(self, metrics: list[dict[str, Any]]) -> int:
        payload = self._post("metrics", {"metrics": metrics})
        return int(payload.get("accepted", 0))

    def _post(self, action: str, body: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/api/runs/{self.run_id}/runtime/{action}"
        data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8").strip()
            except Exception:
                detail = ""
            message = detail or f"http {exc.code}"
            raise RuntimeError(
                f"tahuna.monitor runtime call failed for '{action}': {message[:240]}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"tahuna.monitor runtime endpoint unavailable for '{action}'"
            ) from exc

        if not raw.strip():
            return {}
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"tahuna.monitor runtime response decode failed for '{action}'"
            ) from exc
        if not isinstance(payload, dict):
            raise RuntimeError(
                f"tahuna.monitor runtime response format invalid for '{action}'"
            )
        return payload

