import threading
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from core.db import (
    create_environment,
    create_experiment,
    create_run,
    delete_environment,
    delete_experiment,
    delete_run,
    get_environment,
    get_experiment,
    get_run,
    list_environments,
    list_experiments,
    list_runs,
    update_run,
)
from core.provisioner import (
    GPUS,
    get_images,
    launch_pod,
    terminate_pod,
    wait_for_completion,
    wait_for_pod,
)

app = FastAPI(title="tahuna provisioning api", version="0.1.0")


class EnvironmentCreateRequest(BaseModel):
    name: str
    gpu_type: str = Field(..., description="RunPod GPU type id")
    gpu_count: int = Field(..., ge=1)
    volume_gb: int = Field(..., ge=1)
    framework: str
    version: str


class ExperimentCreateRequest(BaseModel):
    name: str


class RunCreateRequest(BaseModel):
    gpu_type: str | None = None
    gpu_count: int | None = Field(default=None, ge=1)
    volume_gb: int | None = Field(default=None, ge=1)


def _execute_run(run_id: str, overrides: dict[str, Any] | None = None) -> None:
    overrides = overrides or {}
    run = get_run(run_id)
    if not run:
        return

    experiment_id = run.get("experiment_id")
    if not experiment_id:
        update_run(run_id, status="failed", error="Run has no experiment_id")
        return

    exp = get_experiment(experiment_id)
    if not exp:
        update_run(run_id, status="failed", error=f"Experiment {experiment_id} not found")
        return

    env = get_environment(exp["env_id"])
    if not env:
        update_run(run_id, status="failed", error=f"Environment {exp['env_id']} not found")
        return

    gpu_type = overrides.get("gpu_type") or env["gpu_type"]
    gpu_count = overrides.get("gpu_count") or env["gpu_count"]
    volume_gb = overrides.get("volume_gb") or env["volume_gb"]

    update_run(
        run_id,
        status="queued",
        effective_gpu_type=gpu_type,
        effective_gpu_count=gpu_count,
        effective_volume_gb=volume_gb,
    )

    pod_id = None
    try:
        pod_id = launch_pod(
            env_artifacts=env["artifacts"],
            input_path=exp["input"],
            output_path=run["output"],
            logs_path=run["logs"],
            gpu_type=gpu_type,
            gpu_count=gpu_count,
            volume_gb=volume_gb,
            framework=env["framework"],
            version=env["version"],
            run_id=run_id,
        )
        update_run(run_id, status="provisioning", pod_id=pod_id)

        wait_for_pod(pod_id)
        update_run(run_id, status="running")

        wait_for_completion(pod_id)
        update_run(run_id, status="completed")
    except Exception as exc:
        update_run(run_id, status="failed", error=str(exc))
    finally:
        if pod_id:
            try:
                terminate_pod(pod_id)
            except Exception:
                pass


def _start_run_async(run_id: str, overrides: dict[str, Any] | None = None) -> None:
    threading.Thread(target=_execute_run, args=(run_id, overrides), daemon=True).start()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/catalog")
def catalog() -> dict[str, Any]:
    return {"gpus": GPUS, "images": get_images()}


@app.post("/v1/environments")
def create_environment_endpoint(payload: EnvironmentCreateRequest) -> dict[str, Any]:
    images = get_images()
    if payload.gpu_type not in GPUS:
        raise HTTPException(status_code=400, detail=f"Unsupported GPU type: {payload.gpu_type}")
    if payload.framework not in images:
        raise HTTPException(status_code=400, detail=f"Unsupported framework: {payload.framework}")
    if payload.version not in images[payload.framework]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported version for framework {payload.framework}: {payload.version}",
        )

    result = create_environment(
        payload.name,
        payload.gpu_type,
        payload.gpu_count,
        payload.volume_gb,
        payload.framework,
        payload.version,
    )
    environment = get_environment(result["env_id"])
    return {"environment_id": result["env_id"], **environment}


@app.get("/v1/environments")
def get_environments() -> dict[str, Any]:
    environments = [
        {"environment_id": environment_id, **e} for environment_id, e in list_environments().items()
    ]
    return {"environments": environments}


@app.get("/v1/environments/{environment_id}")
def get_environment_endpoint(environment_id: str) -> dict[str, Any]:
    environment = get_environment(environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail=f"Environment {environment_id} not found")
    return {"environment_id": environment_id, **environment}


@app.delete("/v1/environments/{environment_id}")
def remove_environment(environment_id: str) -> dict[str, Any]:
    experiments = list_experiments()
    if any(exp["env_id"] == environment_id for exp in experiments.values()):
        raise HTTPException(
            status_code=409,
            detail=f"Environment {environment_id} still has experiments; delete them first",
        )
    if not delete_environment(environment_id):
        raise HTTPException(status_code=404, detail=f"Environment {environment_id} not found")
    return {"deleted": True, "environment_id": environment_id}


@app.post("/v1/environments/{environment_id}/experiments")
def create_environment_experiment(
    environment_id: str, payload: ExperimentCreateRequest
) -> dict[str, Any]:
    environment = get_environment(environment_id)
    if not environment:
        raise HTTPException(status_code=404, detail=f"Environment {environment_id} not found")
    result = create_experiment(environment_id, payload.name)
    experiment = get_experiment(result["exp_id"])
    return {"experiment_id": result["exp_id"], **experiment}


@app.get("/v1/experiments")
def get_experiments() -> dict[str, Any]:
    experiments = [{"experiment_id": exp_id, **e} for exp_id, e in list_experiments().items()]
    return {"experiments": experiments}


@app.get("/v1/experiments/{experiment_id}")
def get_one_experiment(experiment_id: str) -> dict[str, Any]:
    experiment = get_experiment(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail=f"Experiment {experiment_id} not found")
    return {"experiment_id": experiment_id, **experiment}


@app.delete("/v1/experiments/{experiment_id}")
def remove_experiment(experiment_id: str) -> dict[str, Any]:
    runs = list_runs()
    if any(run.get("experiment_id") == experiment_id for run in runs.values()):
        raise HTTPException(
            status_code=409,
            detail=f"Experiment {experiment_id} still has runs; delete them first",
        )
    if not delete_experiment(experiment_id):
        raise HTTPException(status_code=404, detail=f"Experiment {experiment_id} not found")
    return {"deleted": True, "experiment_id": experiment_id}


@app.post("/v1/experiments/{experiment_id}/runs")
def create_experiment_run(experiment_id: str, payload: RunCreateRequest) -> dict[str, Any]:
    experiment = get_experiment(experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail=f"Experiment {experiment_id} not found")

    result = create_run(experiment["env_id"], experiment["input"], experiment_id=experiment_id)
    run_id = result["run_id"]
    overrides: dict[str, Any] = payload.model_dump(exclude_none=True)
    _start_run_async(run_id, overrides)
    run = get_run(run_id)
    return {"run_id": run_id, **run}


@app.get("/v1/runs")
def get_all_runs() -> dict[str, Any]:
    runs = [{"run_id": run_id, **r} for run_id, r in list_runs().items()]
    return {"runs": runs}


@app.get("/v1/runs/{run_id}")
def get_one_run(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {"run_id": run_id, **run}


@app.get("/v1/runs/{run_id}/logs")
def get_run_logs(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {
        "run_id": run_id,
        "logs_path": run["logs"],
        "log_file": f"{run['logs']}/run.log",
        "note": "Logs are uploaded by the training pod into R2.",
    }


@app.delete("/v1/runs/{run_id}")
def remove_run(run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    if run.get("status") in {"running", "provisioning"}:
        raise HTTPException(status_code=409, detail="Run is active; cancellation is not implemented yet")
    if not delete_run(run_id):
        raise HTTPException(status_code=404, detail=f"Run {run_id} not found")
    return {"deleted": True, "run_id": run_id}
