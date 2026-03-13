from __future__ import annotations

import math
import re
from typing import Any

SENSITIVE_KEY_RE = re.compile(
    r"(secret|token|password|passphrase|api[_-]?key|access[_-]?key|"
    r"private[_-]?key|credential|signature|signed|cookie|session|auth|bearer)",
    re.IGNORECASE,
)

SIGNED_URL_MARKERS = (
    "x-amz-signature=",
    "x-goog-signature=",
    "signature=",
    "sig=",
    "token=",
    "expires=",
)


def is_sensitive_key(name: str) -> bool:
    return bool(SENSITIVE_KEY_RE.search(name.strip()))


def _contains_signed_url(text: str) -> bool:
    lowered = text.lower()
    if "http://" not in lowered and "https://" not in lowered:
        return False
    return any(marker in lowered for marker in SIGNED_URL_MARKERS)


def sanitize_message(message: str, *, max_length: int = 280) -> str:
    cleaned = " ".join(str(message).split())
    if not cleaned:
        return ""
    if _contains_signed_url(cleaned):
        return "[redacted sensitive url]"
    if len(cleaned) > max_length:
        return f"{cleaned[: max_length - 3]}..."
    return cleaned


def coerce_metric_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        numeric = float(value)
        if math.isfinite(numeric):
            return numeric
    return None


def coerce_config_value(value: Any) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        return None
    if isinstance(value, str):
        text = sanitize_message(value, max_length=180)
        if not text:
            return None
        if text == "[redacted sensitive url]":
            return "[redacted]"
        return text
    if value is None:
        return None
    return sanitize_message(str(value), max_length=180)

