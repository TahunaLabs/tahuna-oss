import os
import time
import json
from pathlib import Path
import runpod

runpod.api_key = os.environ.get("RUNPOD_API_KEY", "")

# Load base images from templates/images.json
_images_path = Path(__file__).parent.parent / "templates" / "images.json"
_base_images = json.loads(_images_path.read_text())

def _docker_user() -> str:
    user = os.environ.get("DOCKER_USER")
    if not user:
        raise RuntimeError("DOCKER_USER is required to launch pods")
    return user

def _ensure_runpod_key():
    if not os.environ.get("RUNPOD_API_KEY"):
        raise RuntimeError("RUNPOD_API_KEY is required to launch and monitor pods")
    runpod.api_key = os.environ["RUNPOD_API_KEY"]

def get_images() -> dict:
    """Build image map from configured Docker Hub namespace."""
    user = os.environ.get("DOCKER_USER", "local")
    return {
        framework: {
            version: f"{user}/tahuna:{framework}-{version}"
            for version in versions
        }
        for framework, versions in _base_images.items()
    }

GPUS = [
    "NVIDIA GeForce RTX 4090",
    "NVIDIA GeForce RTX 4080",
    "NVIDIA GeForce RTX 4080 SUPER",
    "NVIDIA GeForce RTX 4070 Ti",
    "NVIDIA GeForce RTX 3090",
    "NVIDIA GeForce RTX 3090 Ti",
    "NVIDIA GeForce RTX 3080",
    "NVIDIA GeForce RTX 3080 Ti",
    "NVIDIA GeForce RTX 3070",
    "NVIDIA A100 80GB PCIe",
    "NVIDIA A100-SXM4-80GB",
    "NVIDIA A40",
    "NVIDIA A30",
    "NVIDIA L40",
    "NVIDIA L40S",
    "NVIDIA L4",
    "NVIDIA H100 80GB HBM3",
    "NVIDIA H100 PCIe",
    "NVIDIA H100 NVL",
    "NVIDIA H200",
    "NVIDIA H200 NVL",
    "NVIDIA RTX A6000",
    "NVIDIA RTX A5000",
    "NVIDIA RTX A4500",
    "NVIDIA RTX A4000",
    "NVIDIA RTX A2000",
    "NVIDIA RTX 6000 Ada Generation",
    "NVIDIA RTX 5000 Ada Generation",
    "NVIDIA RTX 4000 Ada Generation",
    "Tesla V100-SXM2-32GB",
    "Tesla V100-SXM2-16GB",
    "Tesla V100-PCIE-16GB",
]

def launch_pod(
    env_artifacts: str,
    input_path: str,
    output_path: str,
    logs_path: str,
    gpu_type: str,
    gpu_count: int,
    volume_gb: int,
    framework: str,
    version: str,
    run_id: str,
) -> str:
    _ensure_runpod_key()
    image_name = f"{_docker_user()}/tahuna:{framework}-{version}"
    
    pod = runpod.create_pod(
        name=f"tahuna_{run_id}",
        image_name=image_name,
        gpu_type_id=gpu_type,
        gpu_count=gpu_count,
        volume_in_gb=volume_gb,
        env={
            "ENV_ARTIFACTS": env_artifacts,
            "INPUT_PATH": input_path,
            "OUTPUT_PATH": "/workspace/output",
            "OUTPUT_PATH_R2": output_path,
            "LOGS_PATH_R2": logs_path,
            "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
            "R2_ACCESS_KEY": os.environ["R2_ACCESS_KEY"],
            "R2_SECRET_KEY": os.environ["R2_SECRET_KEY"],
            "R2_BUCKET": os.environ["R2_BUCKET"],
        },
    )
    return pod["id"]

def wait_for_pod(pod_id: str):
    """Wait for pod to be running."""
    _ensure_runpod_key()
    while True:
        pod = runpod.get_pod(pod_id)
        if pod["desiredStatus"] == "RUNNING" and pod.get("runtime"):
            return pod
        time.sleep(5)

def wait_for_completion(pod_id: str, timeout: int = 3600):
    """Poll pod until it completes or times out."""
    _ensure_runpod_key()
    start = time.time()
    while time.time() - start < timeout:
        pod = runpod.get_pod(pod_id)
        status = pod.get("desiredStatus")
        runtime = pod.get("runtime", {})
        
        # Check if pod exited
        if status == "EXITED" or not runtime:
            print(f"Pod finished with status: {status}")
            return True
        
        # Still running
        print(f"Pod running... (elapsed: {int(time.time() - start)}s)")
        time.sleep(30)
    
    raise TimeoutError(f"Pod did not complete within {timeout}s")

def terminate_pod(pod_id: str):
    _ensure_runpod_key()
    runpod.terminate_pod(pod_id)
