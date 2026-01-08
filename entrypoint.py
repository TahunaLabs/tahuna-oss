"""
Docker entrypoint - runs on the GPU pod
1. Download data from R2
2. Run preset training script
3. Upload checkpoints to R2
"""
import os
import sys
import json
import boto3
from pathlib import Path

# R2 client
s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
)

def download_data():
    """Pull data from R2 to local"""
    data_path = os.environ["DATA_PATH"]  # s3://bucket/path/data.jsonl
    bucket, key = data_path.replace("s3://", "").split("/", 1)
    local_path = "/data/train.jsonl"
    Path("/data").mkdir(exist_ok=True)
    s3.download_file(bucket, key, local_path)
    print(f"Downloaded {data_path} -> {local_path}")
    return local_path

def upload_checkpoint(local_path: str, remote_path: str):
    """Push checkpoint to R2"""
    bucket = "boobai"
    for root, dirs, files in os.walk(local_path): # TODO: directly get last update from configured model dir
        for file in files:
            local_file = os.path.join(root, file)
            rel_path = os.path.relpath(local_file, local_path)
            s3.upload_file(local_file, bucket, f"{remote_path}/{rel_path}")
    print(f"Uploaded {local_path} -> s3://{bucket}/{remote_path}")

def main():
    preset = os.environ["PRESET"]
    config = eval(os.environ["CONFIG"])  # dict
    base_model = os.environ["BASE_MODEL"]
    
    # 1. Download data
    data_path = download_data()
    
    # 2. Run preset
    if preset == "sft":
        from presets.sft import train
        output_path = train(
            data_path=data_path,
            base_model=base_model,
            **config,
        )
    else:
        print(f"Unknown preset: {preset}")
        sys.exit(1)
    
    # 3. Upload checkpoint
    job_id = os.environ.get("JOB_ID", "default")
    upload_checkpoint(output_path, f"checkpoints/{job_id}")
    
    print("TRAINING_COMPLETE")

if __name__ == "__main__":
    main()
