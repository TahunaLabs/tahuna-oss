FROM pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Install deps
RUN uv pip install transformers trl accelerate datasets boto3 --system

WORKDIR /app
COPY entrypoint.py .
COPY presets/ ./presets/

ENTRYPOINT ["python", "entrypoint.py"]
