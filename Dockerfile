FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Base ML deps - scripts can install more if needed
RUN uv pip install transformers trl accelerate datasets boto3 --system

WORKDIR /workspace
COPY entrypoint.py .

ENTRYPOINT ["python", "entrypoint.py"]
