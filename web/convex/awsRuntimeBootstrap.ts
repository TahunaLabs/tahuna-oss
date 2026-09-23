import { ConvexError } from "convex/values";
import { AWS_COMPUTE_CONFIG } from "@convex/appConfig";
import type { CreateMachineArgs } from "@convex/core/compute";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function encodeBase64(value: string) {
  return btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""));
}

export function buildAwsRuntimeUserData(args: CreateMachineArgs) {
  if (!args.imageName || /[\s\x00]/.test(args.imageName) || args.imageName.startsWith("-")) {
    throw new ConvexError({ detail: "AWS runtime image must be a valid container image reference" });
  }
  const envLines = Object.entries(args.env).map(([key, value]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /[\r\n\x00]/.test(value)) {
      throw new ConvexError({ detail: "AWS runtime environment requires valid variable names and single-line values" });
    }
    return `${key}=${value}`;
  });
  const ports = (args.ports ?? []).filter((port) => port !== "22/tcp").map((port) => {
    const match = /^(\d+)\/(http|tcp)$/.exec(port);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
      throw new ConvexError({ detail: `unsupported AWS runtime port: ${port}` });
    }
    return `--publish ${Number(match[1])}:${Number(match[1])}`;
  });
  // The AMI supplies the NVIDIA driver, toolkit, Docker, and coreutils.
  // No instance role is needed by Warden: it uses its scoped Tahuna runtime token.
  const script = `#!/bin/bash
set -eu
umask 077
trap 'rm -f /opt/tahuna/runtime.env; shutdown -h now' EXIT
install -d -m 700 /opt/tahuna
mkdir -p /workspace
printf '%s' ${shellQuote(encodeBase64(envLines.join("\n")))} | base64 --decode > /opt/tahuna/runtime.env
nvidia-smi
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker
timeout ${AWS_COMPUTE_CONFIG.imagePullTimeoutSeconds} docker pull ${shellQuote(args.imageName)}
docker run --rm --name tahuna-warden --gpus all --ipc host \\
  --mount type=bind,source=/workspace,target=/workspace \\
  --env-file /opt/tahuna/runtime.env ${ports.join(" ")} \\
  --entrypoint /usr/local/bin/warden ${shellQuote(args.imageName)}
`;
  if (new TextEncoder().encode(script).length > AWS_COMPUTE_CONFIG.maxUserDataBytes) {
    throw new ConvexError({ detail: "AWS runtime bootstrap exceeds EC2's 16 KiB user-data limit; reduce runtime environment variables" });
  }
  return encodeBase64(script);
}
