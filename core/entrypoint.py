import os
import subprocess
from pathlib import Path
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

env_path = Path("/workspace/env")

# Find and install first requirements.txt
requirements_files = list(env_path.rglob("requirements.txt"))
if requirements_files:
    req_path = requirements_files[0]
    print(f"Installing requirements from: {req_path}")
    subprocess.run(["pip", "install", "-r", str(req_path)], check=True)

# Find and run first train.py
train_files = list(env_path.rglob("train.py"))
if not train_files:
    raise FileNotFoundError("No train.py found in artifacts")

train_path = train_files[0]
print(f"Running: {train_path}")
subprocess.run(["python", str(train_path)], check=True)

upload_dir("/workspace/output", output_path)

print("DONE")
