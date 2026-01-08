import os
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
)
BUCKET = os.environ["R2_BUCKET"]

def create_run_dirs(run_id: str):
    s3.put_object(Bucket=BUCKET, Key=f"runs/{run_id}/output/.keep", Body=b"")
    s3.put_object(Bucket=BUCKET, Key=f"runs/{run_id}/logs/.keep", Body=b"")

def download_prefix(prefix: str, local_dir: str):
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    for obj in resp.get("Contents", []):
        key = obj["Key"]
        local = f"{local_dir}/{os.path.relpath(key, prefix)}"
        os.makedirs(os.path.dirname(local), exist_ok=True)
        s3.download_file(BUCKET, key, local)

def download_file(key: str, local: str):
    os.makedirs(os.path.dirname(local), exist_ok=True)
    s3.download_file(BUCKET, key, local)

def upload_dir(local_dir: str, prefix: str):
    for root, _, files in os.walk(local_dir):
        for f in files:
            local = os.path.join(root, f)
            key = f"{prefix}/{os.path.relpath(local, local_dir)}"
            s3.upload_file(local, BUCKET, key)
