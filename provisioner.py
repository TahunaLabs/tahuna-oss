import os
import time
import runpod

runpod.api_key = os.environ["RUNPOD_API_KEY"]

def launch_pod(env_artifacts: str, input_path: str, output_path: str, gpu_type: str, gpu_count: int, volume_gb: int) -> str:
    pod = runpod.create_pod(
        name="boobai",
        image_name="boobai/runner:latest",
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
