import json
import uuid
import os
from pathlib import Path
from core.storage import create_run_dirs

DB_PATH = os.environ.get("BOOBAI_DB", "db.json")

def _load():
    if Path(DB_PATH).exists():
        return json.loads(Path(DB_PATH).read_text())
    return {"environments": {}, "runs": {}}

def _save(db):
    Path(DB_PATH).write_text(json.dumps(db, indent=2))

def create_environment(name: str, artifacts_path: str, gpu_type: str, gpu_count: int, volume_gb: int) -> str:
    db = _load()
    env_id = str(uuid.uuid4())[:8]
    db["environments"][env_id] = {
        "name": name,
        "artifacts": artifacts_path,
        "gpu_type": gpu_type,
        "gpu_count": gpu_count,
        "volume_gb": volume_gb,
    }
    _save(db)
    return env_id

def get_environment(env_id: str) -> dict:
    return _load()["environments"].get(env_id)

def create_run(env_id: str, input_path: str) -> dict:
    run_id = str(uuid.uuid4())[:8]
    create_run_dirs(run_id)
    
    run = {
        "env_id": env_id,
        "input": input_path,
        "output": f"runs/{run_id}/output",
        "logs": f"runs/{run_id}/logs",
        "status": "created",
    }
    db = _load()
    db["runs"][run_id] = run
    _save(db)
    return {"run_id": run_id, **run}

def get_run(run_id: str) -> dict:
    return _load()["runs"].get(run_id)

def update_run(run_id: str, **fields):
    db = _load()
    db["runs"][run_id].update(fields)
    _save(db)
