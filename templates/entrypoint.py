"""
Entrypoint script that runs on the RunPod VM.
Downloads artifacts from R2, runs training, uploads output.
"""
import os
import subprocess
import boto3
from pathlib import Path
from datetime import datetime

LOG_PATH = "/workspace/run.log"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")

# Setup S3/R2 client
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
    region_name="auto",
)
BUCKET = os.environ["R2_BUCKET"]
LOGS_PATH = os.environ.get("LOGS_PATH_R2", "")

def upload_logs():
    if not LOGS_PATH:
        return
    try:
        s3.upload_file(LOG_PATH, BUCKET, f"{LOGS_PATH}/run.log")
        log("Logs uploaded")
    except Exception:
        pass  # Best effort

def download_prefix(prefix, local_dir):
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        rel = os.path.relpath(key, prefix)
        local = os.path.join(local_dir, rel)
        os.makedirs(os.path.dirname(local), exist_ok=True)
        s3.download_file(BUCKET, key, local)
    log(f"Downloaded {prefix}")

def upload_dir(local_dir, prefix):
    for root, _, files in os.walk(local_dir):
        for f in files:
            local = os.path.join(root, f)
            key = f"{prefix}/{os.path.relpath(local, local_dir)}"
            s3.upload_file(local, BUCKET, key)
    log(f"Uploaded to {prefix}")

def main():
    os.makedirs("/workspace/env", exist_ok=True)
    os.makedirs("/workspace/data", exist_ok=True)
    os.makedirs("/workspace/output", exist_ok=True)

    log("Downloading artifacts...")
    download_prefix(os.environ["ENV_ARTIFACTS"], "/workspace/env")
    download_prefix(os.environ["INPUT_PATH"], "/workspace/data")

    os.environ["INPUT_PATH"] = "/workspace/data"
    os.environ["OUTPUT_PATH"] = "/workspace/output"

    env_path = Path("/workspace/env")
    
    # Install requirements if found
    req_files = list(env_path.rglob("requirements.txt"))
    if req_files:
        log(f"Installing {req_files[0]}...")
        subprocess.run(["pip", "install", "-r", str(req_files[0])], check=True)

    # Find and run train.py
    train_files = list(env_path.rglob("train.py"))
    if not train_files:
        raise FileNotFoundError("No train.py found in artifacts")

    log(f"Running {train_files[0]}...")
    subprocess.run(["python", "-u", str(train_files[0])], check=True)

    log("Uploading output...")
    upload_dir("/workspace/output", os.environ["OUTPUT_PATH_R2"])
    upload_logs()
    print("DONE")

if __name__ == "__main__":
    main()
