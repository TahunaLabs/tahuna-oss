import json
import logging
import os
import signal
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("TAHUNA_SERVE_PORT", "8000"))
HEALTH_PATH = os.environ.get("TAHUNA_SERVE_HEALTH_PATH", "/health")
MODEL_ROOT = Path(os.environ.get("TAHUNA_MODEL_ROOT", "outputs/model")).resolve()
PREDICT_PATH = "/predict"

logging.basicConfig(
    level=os.environ.get("TAHUNA_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("tahuna.inference")


class ModelServer:
    def __init__(self):
        self.ready = False
        self.startup_error = ""
        self.model_root = MODEL_ROOT
        self.model_example_file = ""

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
        self.ready = True
        LOGGER.info("model_root=%s example_file=%s", self.model_root, self.model_example_file)

    def predict(self, payload):
        raise NotImplementedError(
            "replace ModelServer.predict with model inference logic that reads from TAHUNA_MODEL_ROOT"
        )


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
        except NotImplementedError as err:
            self._write_json(HTTPStatus.NOT_IMPLEMENTED, {"detail": str(err)})
            return
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
