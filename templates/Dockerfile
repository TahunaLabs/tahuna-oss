ARG BASE_IMAGE
FROM ${BASE_IMAGE}

RUN pip install --no-cache-dir boto3

COPY entrypoint.py /entrypoint.py

CMD ["python", "-u", "/entrypoint.py"]
