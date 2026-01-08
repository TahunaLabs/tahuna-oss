import os
import subprocess
from core.storage import download_prefix, download_file, upload_dir

env_artifacts = os.environ["ENV_ARTIFACTS"]
input_path = os.environ["INPUT_PATH"]
output_path = os.environ["OUTPUT_PATH"]

os.makedirs("/workspace/env", exist_ok=True)
os.makedirs("/workspace/output", exist_ok=True)

download_prefix(env_artifacts, "/workspace/env")
download_file(input_path, "/workspace/data")

os.environ["INPUT_PATH"] = "/workspace/data"
os.environ["OUTPUT_PATH"] = "/workspace/output"

subprocess.run(["python", "/workspace/env/train.py"], check=True)

upload_dir("/workspace/output", output_path)

print("DONE")
