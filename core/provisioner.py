import os
import time
import runpod

runpod.api_key = os.environ["RUNPOD_API_KEY"]


IMAGES = {
    "pt": {
        "2.8.0-cu128": "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",
        "2.4.0-cu124": "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
        "2.2.0-cu121": "runpod/pytorch:2.2.0-py3.10-cuda12.1.1-devel-ubuntu22.04",
        "2.1.0-cu118": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
    },
}

def launch_pod(
    env_artifacts: str,
    input_path: str,
    output_path: str,
    gpu_type: str,
    gpu_count: int,
    volume_gb: int,
    framework: str,
    version: str,
    run_id: str,
) -> str:
    image_name = IMAGES[framework][version]
    pod = runpod.create_pod(
        name=f"tahuna_{run_id}",
        image_name=image_name,
        gpu_type_id=gpu_type,
        gpu_count=gpu_count,
        volume_in_gb=volume_gb,
        env={
            "ENV_ARTIFACTS": env_artifacts,
            "INPUT_PATH": input_path,
            "OUTPUT_PATH": output_path,
            "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
            "R2_ACCESS_KEY": os.environ["R2_ACCESS_KEY"],
            "R2_SECRET_KEY": os.environ["R2_SECRET_KEY"],
            "R2_BUCKET": os.environ["R2_BUCKET"],
        },
    )
    return pod["id"]

def wait_for_pod(pod_id: str):
    while True:
        status = runpod.get_pod(pod_id)
        if status["desiredStatus"] == "RUNNING" and status.get("runtime"):
            break
        time.sleep(5)

def stream_logs(pod_id: str):
    for log in runpod.get_pod_logs(pod_id, follow=True):
        print(log)
        if "DONE" in log:
            break

def terminate_pod(pod_id: str):
    runpod.terminate_pod(pod_id)
