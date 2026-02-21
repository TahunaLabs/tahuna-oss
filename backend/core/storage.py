import os
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["R2_ENDPOINT"],
    aws_access_key_id=os.environ["R2_ACCESS_KEY"],
    aws_secret_access_key=os.environ["R2_SECRET_KEY"],
    region_name="auto",
)
BUCKET = os.environ["R2_BUCKET"]

def create_run_dirs(run_id: str):
    s3.put_object(Bucket=BUCKET, Key=f"runs/{run_id}/output/.keep", Body=b"")
    s3.put_object(Bucket=BUCKET, Key=f"runs/{run_id}/logs/.keep", Body=b"")

def create_experiment_input_dir(exp_id: str):
    s3.put_object(Bucket=BUCKET, Key=f"experiments/{exp_id}/input/.keep", Body=b"")

def create_env_artifacts_dir(env_id: str):
    s3.put_object(Bucket=BUCKET, Key=f"environments/{env_id}/artifacts/.keep", Body=b"")
