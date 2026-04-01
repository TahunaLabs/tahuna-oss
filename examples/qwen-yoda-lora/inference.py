import json
import logging
import os
import signal
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from peft import AutoPeftModelForCausalLM
from transformers import AutoTokenizer

PORT = int(os.environ.get("TAHUNA_SERVE_PORT", "8000"))
HEALTH_PATH = os.environ.get("TAHUNA_SERVE_HEALTH_PATH", "/health")
MODEL_ROOT = Path(os.environ.get("TAHUNA_MODEL_ROOT", "outputs/adapter")).resolve()
PREDICT_PATH = "/predict"
DEFAULT_MAX_NEW_TOKENS = 64
DEFAULT_TEMPERATURE = 0.0
DEFAULT_TOP_P = 1.0

logging.basicConfig(
    level=os.environ.get("TAHUNA_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("tahuna.inference")


def select_torch_dtype() -> torch.dtype:
    if not torch.cuda.is_available():
        return torch.float32
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


class ModelServer:
    def __init__(self):
        self.ready = False
        self.startup_error = ""
        self.model_root = MODEL_ROOT
        self.model_example_file = ""
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.dtype = select_torch_dtype()
        self.model = None
        self.tokenizer = None

    def load(self):
        if not self.model_root.exists():
            raise RuntimeError(
                f"model root not found: {self.model_root}. "
                "Tahuna mounts the pinned serve snapshot at TAHUNA_MODEL_ROOT."
            )
        first_file = next((path for path in self.model_root.rglob("*") if path.is_file()), None)
        if first_file is None:
            raise RuntimeError(
                f"model root is empty: {self.model_root}. "
                "Check train.output_model_path and serve.default_model_path."
            )
        self.model_example_file = str(first_file.relative_to(self.model_root))
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_root), use_fast=True)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        self.model = AutoPeftModelForCausalLM.from_pretrained(
            str(self.model_root),
            torch_dtype=self.dtype,
        )
        self.model.to(self.device)
        self.model.eval()
        self.ready = True
        LOGGER.info(
            "model_root=%s example_file=%s device=%s dtype=%s",
            self.model_root,
            self.model_example_file,
            self.device,
            self.dtype,
        )

    def _prompt_from_messages(self, messages):
        if not isinstance(messages, list) or len(messages) == 0:
            raise ValueError("messages must be a non-empty array")
        normalized = []
        for item in messages:
            if not isinstance(item, dict):
                raise ValueError("each message must be an object with role and content")
            role = str(item.get("role", "")).strip()
            content = item.get("content")
            if not isinstance(content, str):
                raise ValueError("each message content must be a string")
            content = content.strip()
            if not role or not content:
                raise ValueError("each message must include non-empty role and content")
            normalized.append({"role": role, "content": content})
        if hasattr(self.tokenizer, "apply_chat_template"):
            return self.tokenizer.apply_chat_template(
                normalized,
                tokenize=False,
                add_generation_prompt=True,
            )
        return "\n".join(f"{item['role']}: {item['content']}" for item in normalized)

    def _resolve_prompt(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        prompt = payload.get("prompt")
        if isinstance(prompt, str) and prompt.strip():
            return prompt.strip()
        if "messages" in payload:
            return self._prompt_from_messages(payload["messages"])
        raise ValueError("request must include a non-empty 'prompt' string or 'messages' array")

    def _resolve_int(self, payload, key, default, minimum=1, maximum=1024):
        value = payload.get(key, default)
        if not isinstance(value, int):
            raise ValueError(f"{key} must be an integer")
        if value < minimum or value > maximum:
            raise ValueError(f"{key} must be between {minimum} and {maximum}")
        return value

    def _resolve_float(self, payload, key, default, minimum=0.0, maximum=2.0):
        value = payload.get(key, default)
        if isinstance(value, int):
            value = float(value)
        if not isinstance(value, float):
            raise ValueError(f"{key} must be a number")
        if value < minimum or value > maximum:
            raise ValueError(f"{key} must be between {minimum} and {maximum}")
        return value

    def predict(self, payload):
        if not self.ready or self.model is None or self.tokenizer is None:
            raise RuntimeError("model is not ready")

        prompt = self._resolve_prompt(payload)
        max_new_tokens = self._resolve_int(payload, "max_new_tokens", DEFAULT_MAX_NEW_TOKENS)
        temperature = self._resolve_float(payload, "temperature", DEFAULT_TEMPERATURE)
        top_p = self._resolve_float(payload, "top_p", DEFAULT_TOP_P, minimum=0.0, maximum=1.0)

        encoded = self.tokenizer(prompt, return_tensors="pt")
        encoded = {key: value.to(self.device) for key, value in encoded.items()}

        generate_kwargs = {
            "max_new_tokens": max_new_tokens,
            "pad_token_id": self.tokenizer.pad_token_id,
            "eos_token_id": self.tokenizer.eos_token_id,
        }
        if temperature > 0:
            generate_kwargs["do_sample"] = True
            generate_kwargs["temperature"] = temperature
            generate_kwargs["top_p"] = top_p
        else:
            generate_kwargs["do_sample"] = False

        with torch.inference_mode():
            generated = self.model.generate(**encoded, **generate_kwargs)
        new_tokens = generated[0, encoded["input_ids"].shape[1] :]
        text = self.tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        return {
            "generated_text": text,
            "model_root": str(self.model_root),
        }


APP = ModelServer()


class Handler(BaseHTTPRequestHandler):
    server_version = "TahunaInference/0.1"

    def log_message(self, format, *args):
        LOGGER.info("http %s - " + format, self.address_string(), *args)

    def _write_json(self, status, payload):
        body = json.dumps(payload, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        if self.path == "/":
            self._write_json(
                HTTPStatus.OK,
                {
                    "service": "tahuna-inference",
                    "health_path": HEALTH_PATH,
                    "predict_path": PREDICT_PATH,
                    "model_root": str(APP.model_root),
                },
            )
            return
        if self.path == HEALTH_PATH:
            payload = {
                "status": "ok" if APP.ready else "starting",
                "model_root": str(APP.model_root),
                "model_example_file": APP.model_example_file,
                "predict_path": PREDICT_PATH,
            }
            if APP.startup_error:
                payload["error"] = APP.startup_error
            self._write_json(HTTPStatus.OK if APP.ready else HTTPStatus.SERVICE_UNAVAILABLE, payload)
            return
        self._write_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})

    def do_POST(self):
        if self.path != PREDICT_PATH:
            self._write_json(HTTPStatus.NOT_FOUND, {"detail": "not found"})
            return
        if not APP.ready:
            self._write_json(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {
                    "detail": "model is not ready yet",
                    "error": APP.startup_error or "",
                },
            )
            return
        try:
            payload = self._read_json()
        except json.JSONDecodeError as err:
            self._write_json(HTTPStatus.BAD_REQUEST, {"detail": f"invalid JSON body: {err.msg}"})
            return
        try:
            result = APP.predict(payload)
        except ValueError as err:
            self._write_json(HTTPStatus.BAD_REQUEST, {"detail": str(err)})
            return
        except Exception:
            LOGGER.exception("prediction failed")
            self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"detail": "prediction failed"})
            return
        self._write_json(HTTPStatus.OK, {"result": result})


def install_signal_handlers(server):
    def _handle_signal(signum, _frame):
        LOGGER.info("received signal=%s, shutting down", signum)
        server.shutdown()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)


if __name__ == "__main__":
    try:
        APP.load()
    except Exception as err:
        APP.startup_error = str(err)
        LOGGER.exception("startup failed")

    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    install_signal_handlers(server)
    LOGGER.info("listening on 0.0.0.0:%s", PORT)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        LOGGER.info("server stopped")
