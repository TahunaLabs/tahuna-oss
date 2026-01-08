"""
BoobAI - Bare minimum training orchestrator

Flow:
1. Define job (preset + data path + gpu config)
2. Provision RunPod instance
3. Run Docker container with training script
4. Stream logs/metrics back
5. Save checkpoints to R2
"""
import os
import time
import runpod
from dataclasses import dataclass

# RunPod config
runpod.api_key = os.environ["RUNPOD_API_KEY"]

@dataclass
class Job:
    preset: str           # "sft" 
    data_path: str        # R2 path to data
    base_model: str       # HuggingFace model ID
    gpu_type: str         # "NVIDIA RTX 4090"
    gpu_count: int        # 2
    config: dict          # preset-specific config (epochs, lr, etc.)

def run_job(job: Job):
    """Main entry point - runs entire training flow"""
    
    # 1. Provision pod
    print(f"Provisioning {job.gpu_count}x {job.gpu_type}...")
    pod = runpod.create_pod(
        name="boobai-train",
        image_name="boobai/train:latest",  # Our Docker image
        gpu_type_id=job.gpu_type,
        gpu_count=job.gpu_count,
        volume_in_gb=100,
        env={
            "PRESET": job.preset,
            "DATA_PATH": job.data_path,
            "BASE_MODEL": job.base_model,
            "CONFIG": str(job.config),
            "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
            "R2_ACCESS_KEY": os.environ["R2_ACCESS_KEY"],
            "R2_SECRET_KEY": os.environ["R2_SECRET_KEY"],
        },
    )
    pod_id = pod["id"]
    print(f"Pod created: {pod_id}")
    
    # 2. Wait for running
    while True:
        status = runpod.get_pod(pod_id)
        if status["desiredStatus"] == "RUNNING" and status.get("runtime"):
            break
        print("Waiting for pod...")
        time.sleep(5)
    
    print(f"Pod running at {status['runtime']['ports']}")
    
    # 3. Stream logs until done
    try:
        stream_logs(pod_id)
    finally:
        # 4. Cleanup
        print("Terminating pod...")
        runpod.terminate_pod(pod_id)

def stream_logs(pod_id: str):
    """Stream logs from pod until training completes"""
    # RunPod logs come via their API
    for log in runpod.get_pod_logs(pod_id, follow=True):
        print(log)
        if "TRAINING_COMPLETE" in log:
            break

# Example usage
if __name__ == "__main__":
    job = Job(
        preset="sft",
        data_path="s3://boobai/data/my-dataset.jsonl",
        base_model="meta-llama/Llama-3.1-8B",
        gpu_type="NVIDIA RTX 4090",
        gpu_count=2,
        config={"epochs": 3, "lr": 2e-5, "batch_size": 4},
    )
    run_job(job)
