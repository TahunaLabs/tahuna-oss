import json
import uuid
import os
from pathlib import Path
from core.storage import create_run_dirs, create_experiment_input_dir, create_env_artifacts_dir

DB_PATH = os.environ.get("TAHUNA_DB", "db.json")

def _load():
    if Path(DB_PATH).exists():
        return json.loads(Path(DB_PATH).read_text())
    return {"environments": {}, "experiments": {}, "runs": {}}

def _save(db):
    Path(DB_PATH).write_text(json.dumps(db, indent=2))

def create_environment(name: str, gpu_type: str, gpu_count: int, volume_gb: int, framework: str, version: str) -> dict:
    db = _load()
    env_id = str(uuid.uuid4())[:8]
    artifacts_path = f"environments/{env_id}/artifacts"
    create_env_artifacts_dir(env_id)
    
    db["environments"][env_id] = {
        "name": name,
        "artifacts": artifacts_path,
        "gpu_type": gpu_type,
        "gpu_count": gpu_count,
        "volume_gb": volume_gb,
        "framework": framework,
        "version": version,
    }
    _save(db)
    return {"env_id": env_id, "artifacts": artifacts_path}

def list_environments() -> dict:
    return _load()["environments"]

def get_environment(env_id: str) -> dict:
    return _load()["environments"].get(env_id)

def delete_environment(env_id: str) -> bool:
    db = _load()
    if env_id not in db["environments"]:
        return False
    del db["environments"][env_id]
    _save(db)
    return True

def create_experiment(env_id: str, name: str) -> dict:
    db = _load()
    if env_id not in db["environments"]:
        raise ValueError(f"Environment {env_id} not found")
    
    exp_id = str(uuid.uuid4())[:8]
    input_path = f"experiments/{exp_id}/input"
    create_experiment_input_dir(exp_id)
    
    db["experiments"][exp_id] = {
        "name": name,
        "env_id": env_id,
        "input": input_path,
    }
    _save(db)
    return {"exp_id": exp_id, "input": input_path}

def list_experiments() -> dict:
    return _load()["experiments"]

def get_experiment(exp_id: str) -> dict:
    return _load()["experiments"].get(exp_id)

def delete_experiment(exp_id: str) -> bool:
    db = _load()
    if exp_id not in db["experiments"]:
        return False
    del db["experiments"][exp_id]
    _save(db)
    return True

def create_run(env_id: str, input_path: str, experiment_id: str | None = None) -> dict:
    run_id = str(uuid.uuid4())[:8]
    create_run_dirs(run_id)
    
    run = {
        "env_id": env_id,
        "experiment_id": experiment_id,
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

def list_runs() -> dict:
    return _load()["runs"]

def delete_run(run_id: str) -> bool:
    db = _load()
    if run_id not in db["runs"]:
        return False
    del db["runs"][run_id]
    _save(db)
    return True

def update_run(run_id: str, **fields):
    db = _load()
    db["runs"][run_id].update(fields)
    _save(db)
