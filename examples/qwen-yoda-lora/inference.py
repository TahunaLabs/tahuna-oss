#!/usr/bin/env python3
import json
import logging
import os
import shlex
import shutil
from pathlib import Path

PORT = int(os.environ.get("TAHUNA_SERVE_PORT", "8000"))
HEALTH_PATH = os.environ.get("TAHUNA_SERVE_HEALTH_PATH", "/health").strip() or "/health"
MODEL_ROOT = Path(os.environ.get("TAHUNA_MODEL_ROOT", "outputs/adapter")).resolve()
LORA_NAME = os.environ.get("TAHUNA_VLLM_LORA_NAME", "qwen-yoda-lora")

logging.basicConfig(
    level=os.environ.get("TAHUNA_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("tahuna.inference")


def ensure_model_root() -> str:
    if not MODEL_ROOT.exists():
        raise RuntimeError(
            f"model root not found: {MODEL_ROOT}. "
            "Tahuna mounts the pinned serve snapshot at TAHUNA_MODEL_ROOT."
        )
    first_file = next((path for path in MODEL_ROOT.rglob("*") if path.is_file()), None)
    if first_file is None:
        raise RuntimeError(
            f"model root is empty: {MODEL_ROOT}. "
            "Check train.output_model_path and serve.default_model_path."
        )
    return str(first_file.relative_to(MODEL_ROOT))


def load_adapter_base_model() -> str | None:
    adapter_config_path = MODEL_ROOT / "adapter_config.json"
    if not adapter_config_path.exists():
        return None
    payload = json.loads(adapter_config_path.read_text(encoding="utf-8"))
    base_model_name = payload.get("base_model_name_or_path")
    if not isinstance(base_model_name, str) or not base_model_name.strip():
        raise RuntimeError(
            f"{adapter_config_path} is missing base_model_name_or_path, so vLLM cannot attach the adapter."
        )
    return base_model_name.strip()


def build_command() -> list[str]:
    if HEALTH_PATH != "/health":
        raise RuntimeError(
            f"unsupported TAHUNA_SERVE_HEALTH_PATH={HEALTH_PATH!r}: this example now uses raw vLLM, "
            "which exposes readiness on /health."
        )

    vllm_binary = shutil.which("vllm")
    if vllm_binary is None:
        raise RuntimeError("vllm is not installed in the active environment. Sync the serve dependency group first.")

    base_model_name = load_adapter_base_model()
    command = [
        vllm_binary,
        "serve",
        base_model_name or str(MODEL_ROOT),
        "--host",
        "0.0.0.0",
        "--port",
        str(PORT),
    ]
    if base_model_name:
        command.extend(
            [
                "--enable-lora",
                "--lora-modules",
                f"{LORA_NAME}={MODEL_ROOT}",
            ]
        )
    return command


def main() -> None:
    example_file = ensure_model_root()
    base_model_name = load_adapter_base_model()
    mode = "lora-adapter" if base_model_name else "full-model"
    command = build_command()
    LOGGER.info(
        "mode=%s model_root=%s example_file=%s health_path=%s port=%s",
        mode,
        MODEL_ROOT,
        example_file,
        HEALTH_PATH,
        PORT,
    )
    if base_model_name:
        LOGGER.info("base_model=%s lora_name=%s", base_model_name, LORA_NAME)
    LOGGER.info("launching %s", shlex.join(command))
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
