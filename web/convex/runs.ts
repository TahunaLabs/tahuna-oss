import { Workpool } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "./catalog";

const RUN_STATUS = {
  QUEUED: "queued",
  PROVISIONING: "provisioning",
  RUNNING: "running",
  CANCELLING: "cancelling",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
const ACTIVE_STATUSES: Set<string> = new Set([
  RUN_STATUS.QUEUED,
  RUN_STATUS.PROVISIONING,
  RUN_STATUS.RUNNING,
  RUN_STATUS.CANCELLING,
]);
const TERMINAL_STATUSES: Set<string> = new Set([
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
]);
const runResponseValidator = v.object({
  run_id: v.string(),
  created_at: v.number(),
  env_id: v.string(),
  input: v.string(),
  output: v.string(),
  logs: v.string(),
  status: v.string(),
  error: v.string(),
  pod_id: v.string(),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  code_manifest_hash: v.string(),
  data_manifest_hash: v.string(),
  cancellation_requested: v.boolean(),
  artifact_keys: v.array(v.string()),
});
const listRunsResponseValidator = v.object({
  runs: v.array(runResponseValidator),
});
const runLogsResponseValidator = v.object({
  run_id: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
  recent_logs: v.array(
    v.object({
      timestamp: v.number(),
      level: v.string(),
      source: v.string(),
      message: v.string(),
    }),
  ),
  recent_metrics: v.array(
    v.object({
      timestamp: v.number(),
      name: v.string(),
      value: v.number(),
      step: v.union(v.number(), v.null()),
      unit: v.union(v.string(), v.null()),
      source: v.string(),
    }),
  ),
});
const provisioningPayloadValidator = v.object({
  run_id: v.string(),
  environment_id: v.string(),
  user_id: v.string(),
  input_path: v.string(),
  output_path: v.string(),
  logs_path: v.string(),
  code_manifest_hash: v.union(v.string(), v.null()),
  data_manifest_hash: v.union(v.string(), v.null()),
  code_manifest_key: v.union(v.string(), v.null()),
  data_manifest_key: v.union(v.string(), v.null()),
  contract_version: v.string(),
  bootstrap_summary: v.optional(
    v.object({
      code_files: v.number(),
      code_bytes: v.number(),
      data_files: v.number(),
      data_bytes: v.number(),
    }),
  ),
  runpod_pod_id: v.optional(v.string()),
});
const runProvisionSpecValidator = v.object({
  run_id: v.string(),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  framework: v.string(),
  version: v.string(),
});
const runtimeLogLineValidator = v.object({
  message: v.string(),
  level: v.optional(v.string()),
  source: v.optional(v.string()),
  timestamp: v.optional(v.number()),
});
const runtimeMetricSampleValidator = v.object({
  name: v.string(),
  value: v.number(),
  step: v.optional(v.number()),
  unit: v.optional(v.string()),
  source: v.optional(v.string()),
  timestamp: v.optional(v.number()),
});
const runtimeStatusValidator = v.union(
  v.literal(RUN_STATUS.PROVISIONING),
  v.literal(RUN_STATUS.RUNNING),
  v.literal(RUN_STATUS.COMPLETED),
  v.literal(RUN_STATUS.FAILED),
  v.literal(RUN_STATUS.CANCELLED),
);
const runtimeBootstrapEntryValidator = v.object({
  path: v.string(),
  sha256: v.string(),
  size: v.number(),
  mode: v.number(),
  download_url: v.string(),
});
const runtimeBootstrapPlanValidator = v.object({
  run_id: v.string(),
  contract_version: v.string(),
  workspace_root: v.string(),
  code: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  data: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
});

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
});
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const RUNTIME_LOG_TAIL_LIMIT = 200;
const RUNTIME_METRIC_TAIL_LIMIT = 200;

type SyncKind = "code" | "data";
type ManifestEntry = {
  path: string;
  sha256: string;
  size: number;
  mode: number;
};
type SyncManifestPayload = {
  version: number;
  type: SyncKind;
  created_at: number;
  entries: ManifestEntry[];
};
type RuntimeBootstrapEntry = ManifestEntry & { download_url: string };
type ProvisioningPayload = {
  run_id: string;
  environment_id: string;
  user_id: string;
  input_path: string;
  output_path: string;
  logs_path: string;
  code_manifest_hash: string | null;
  data_manifest_hash: string | null;
  code_manifest_key: string | null;
  data_manifest_key: string | null;
  contract_version: string;
  bootstrap_summary?: {
    code_files: number;
    code_bytes: number;
    data_files: number;
    data_bytes: number;
  };
  runpod_pod_id?: string;
};
type RuntimeBootstrapPlan = {
  run_id: string;
  contract_version: string;
  workspace_root: string;
  code: {
    manifest_hash: string;
    entries: RuntimeBootstrapEntry[];
  };
  data: {
    manifest_hash: string;
    entries: RuntimeBootstrapEntry[];
  };
};

function toRunResponse(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    created_at: row._creationTime,
    env_id: String(row.environmentId),
    input: row.input,
    output: row.output,
    logs: row.logs,
    status: row.status,
    error: row.error || "",
    pod_id: row.podId || "",
    effective_gpu_type: row.effectiveGpuType || "",
    effective_gpu_count: row.effectiveGpuCount || 0,
    effective_volume_gb: row.effectiveVolumeGb || 0,
    code_manifest_hash: row.codeManifestHash || "",
    data_manifest_hash: row.dataManifestHash || "",
    cancellation_requested: row.cancellationRequested,
    artifact_keys: row.artifactKeys || [],
  };
}

function normalizeRuntimeLevel(level: string | undefined) {
  const trimmed = (level || "").trim().toLowerCase();
  if (trimmed === "debug" || trimmed === "warn" || trimmed === "warning" || trimmed === "error") {
    return trimmed === "warning" ? "warn" : trimmed;
  }
  return "info";
}

function normalizeRuntimeSource(source: string | undefined) {
  const trimmed = (source || "").trim();
  return trimmed || "pod";
}

function normalizeRuntimeTimestamp(timestamp: number | undefined) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    return Math.floor(timestamp);
  }
  return Date.now();
}

function sanitizeRuntimeMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 4000);
}

function manifestKey(
  userId: string,
  environmentId: Id<"environments">,
  dataId: string | undefined,
  kind: "code" | "data",
  manifestHash?: string,
) {
  if (!manifestHash) {
    return null;
  }
  if (kind === "data") {
    const resolvedDataId = dataId || String(environmentId);
    return `${userId}/data/${resolvedDataId}/manifests/${manifestHash}.json`;
  }
  return `${userId}/environment/${environmentId}/manifests/${kind}/${manifestHash}.json`;
}

function toProvisioningPayload(row: Doc<"runs">): ProvisioningPayload {
  return {
    run_id: String(row._id),
    environment_id: String(row.environmentId),
    user_id: row.userId,
    input_path: row.input,
    output_path: row.output,
    logs_path: row.logs,
    code_manifest_hash: row.codeManifestHash ?? null,
    data_manifest_hash: row.dataManifestHash ?? null,
    code_manifest_key: manifestKey(row.userId, row.environmentId, row.dataId, "code", row.codeManifestHash),
    data_manifest_key: manifestKey(row.userId, row.environmentId, row.dataId, "data", row.dataManifestHash),
    contract_version: "sync-incremental-0.1.0",
  };
}

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(hash)) return null;
  return hash;
}

function parseManifestEntry(value: unknown): ManifestEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const path = typeof row.path === "string" ? row.path.trim() : "";
  const sha256 = normalizeSha256(row.sha256);
  const size = typeof row.size === "number" ? row.size : NaN;
  const mode = typeof row.mode === "number" ? row.mode : NaN;
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    return null;
  }
  if (path === "." || path === ".." || path.includes("/../") || path.startsWith("../")) {
    return null;
  }
  if (!sha256 || !Number.isFinite(size) || size < 0 || !Number.isInteger(size)) {
    return null;
  }
  if (!Number.isFinite(mode) || mode < 0 || mode > 0o777 || !Number.isInteger(mode)) {
    return null;
  }
  return { path, sha256, size, mode };
}

function parseManifest(value: unknown, kind: SyncKind): SyncManifestPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const version = row.version;
  const type = row.type;
  const createdAt = row.created_at;
  const entries = row.entries;
  if (version !== 1 || type !== kind || typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return null;
  }
  if (!Array.isArray(entries)) {
    return null;
  }
  const parsedEntries: ManifestEntry[] = [];
  let previousPath = "";
  for (const entry of entries) {
    const parsed = parseManifestEntry(entry);
    if (!parsed) {
      return null;
    }
    if (previousPath !== "" && parsed.path < previousPath) {
      return null;
    }
    previousPath = parsed.path;
    parsedEntries.push(parsed);
  }
  return {
    version: 1,
    type: kind,
    created_at: createdAt,
    entries: parsedEntries,
  };
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchObjectBytes(ctx: ActionCtx, key: string): Promise<ArrayBuffer> {
  const downloadUrl = await ctx.runQuery(internal.cli.internalGetObjectDownloadUrl, { key });
  if (!downloadUrl) {
    throw new Error(`object not found: ${key}`);
  }
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`failed to fetch object ${key}: http ${response.status}`);
  }
  return await response.arrayBuffer();
}

async function fetchManifest(
  ctx: ActionCtx,
  kind: SyncKind,
  key: string,
  expectedHash: string,
) {
  const rawBytes = await fetchObjectBytes(ctx, key);
  const rawText = new TextDecoder().decode(rawBytes);
  const actualHash = await sha256Hex(rawText);
  if (actualHash !== expectedHash) {
    throw new Error(`${kind} manifest hash mismatch`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`${kind} manifest is not valid JSON`);
  }
  const manifest = parseManifest(parsed, kind);
  if (!manifest) {
    throw new Error(`${kind} manifest payload is invalid`);
  }
  return manifest;
}

function blobKey(
  payload: {
    user_id: string;
    environment_id: string;
    data_manifest_key: string | null;
  },
  kind: SyncKind,
  sha256: string,
) {
  if (kind === "code") {
    return `${payload.user_id}/environment/${payload.environment_id}/blobs/code/${sha256}`;
  }
  const dataKey = payload.data_manifest_key;
  if (!dataKey) {
    throw new Error("data manifest key is missing");
  }
  const marker = "/manifests/";
  const markerIndex = dataKey.indexOf(marker);
  if (markerIndex <= 0) {
    throw new Error("invalid data manifest key");
  }
  return `${dataKey.slice(0, markerIndex)}/blobs/${sha256}`;
}

function summarizeManifest(manifest: SyncManifestPayload) {
  return {
    fileCount: manifest.entries.length,
    totalBytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
  };
}

async function resolveManifestDownloadEntries(
  ctx: ActionCtx,
  payload: {
    user_id: string;
    environment_id: string;
    data_manifest_key: string | null;
  },
  kind: SyncKind,
  manifest: SyncManifestPayload,
): Promise<RuntimeBootstrapEntry[]> {
  const entries: RuntimeBootstrapEntry[] = [];
  for (const entry of manifest.entries) {
    const key = blobKey(payload, kind, entry.sha256);
    const downloadUrl = await ctx.runQuery(internal.cli.internalGetObjectDownloadUrl, { key });
    if (!downloadUrl) {
      throw new Error(`${kind} blob is missing from object storage: ${entry.sha256}`);
    }
    entries.push({
      ...entry,
      download_url: downloadUrl,
    });
  }
  return entries;
}

function resolveImageName(framework: string, version: string) {
  const frameworkImages = images[framework];
  if (!frameworkImages) {
    throw new Error(`unsupported framework for provisioning: ${framework}`);
  }
  const imageName = frameworkImages[version];
  if (!imageName) {
    throw new Error(`unsupported framework version for provisioning: ${framework}:${version}`);
  }
  return imageName;
}

function resolveRuntimeApiBase() {
  // Prefer publicly-accessible Convex site URLs for pod runtime callbacks.
  // SITE_URL / NEXT_PUBLIC_SITE_URL are often http://localhost:3000 in dev
  // and unreachable from remote pods.
  const candidates = [
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.CONVEX_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed && !trimmed.includes("localhost") && !trimmed.includes("127.0.0.1")) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  // Fallback: allow localhost if nothing else is available (local dev testing)
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  throw new Error("SITE_URL (or NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_CONVEX_SITE_URL) is required for pod runtime callbacks");
}

function generateRuntimeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildPodBootstrapStartCommand() {
  return String.raw`set -euo pipefail
cat <<'PY' >/tmp/tahuna_bootstrap.py
import hashlib
import json
import os
import re
import subprocess
import tarfile
import urllib.error
import urllib.request

RUN_ID = (os.environ.get("TAHUNA_RUN_ID") or "").strip()
API_BASE = (os.environ.get("TAHUNA_API_BASE") or "").strip().rstrip("/")
RUNTIME_TOKEN = (os.environ.get("TAHUNA_RUNTIME_TOKEN") or "").strip()
WORKSPACE_ROOT = (os.environ.get("TAHUNA_WORKSPACE_ROOT") or "/workspace").strip() or "/workspace"
DATA_ROOT = os.path.join(WORKSPACE_ROOT, "data")

if not RUN_ID or not API_BASE or not RUNTIME_TOKEN:
    raise RuntimeError("missing runtime env vars: TAHUNA_RUN_ID / TAHUNA_API_BASE / TAHUNA_RUNTIME_TOKEN")

def api_request(method, path, payload=None):
    url = API_BASE + path
    headers = {"Authorization": "Bearer " + RUNTIME_TOKEN}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError("runtime API " + method + " " + path + " failed: " + str(err.code) + " " + body)

def emit_logs(lines, level="info", source="pod"):
    payload_lines = []
    for line in lines:
        text = str(line).strip()
        if not text:
            continue
        payload_lines.append({
            "message": text,
            "level": level,
            "source": source,
        })
    if not payload_lines:
        return
    try:
        api_request("POST", "/api/runs/" + RUN_ID + "/runtime/logs", {"lines": payload_lines})
    except Exception:
        pass

def emit_metrics(metrics):
    clean = []
    for metric in metrics:
        name = str(metric.get("name", "")).strip()
        if not name:
            continue
        try:
            value = float(metric.get("value"))
        except Exception:
            continue
        row = {"name": name, "value": value, "source": str(metric.get("source", "pod"))}
        if "step" in metric and metric["step"] is not None:
            try:
                row["step"] = int(metric["step"])
            except Exception:
                pass
        if "unit" in metric and metric["unit"]:
            row["unit"] = str(metric["unit"])
        clean.append(row)
    if not clean:
        return
    try:
        api_request("POST", "/api/runs/" + RUN_ID + "/runtime/metrics", {"metrics": clean})
    except Exception:
        pass

def emit_status(status, message, error=None):
    payload = {"status": status, "message": message}
    if error:
        payload["error"] = error
    try:
        api_request("POST", "/api/runs/" + RUN_ID + "/runtime/status", payload)
    except Exception:
        pass

def safe_rel_path(path):
    cleaned = os.path.normpath(str(path).replace("\\\\", "/")).lstrip("/")
    if cleaned in ("", ".", "..") or cleaned.startswith("../"):
        raise RuntimeError("invalid manifest path: " + str(path))
    return cleaned

def download_bytes(url):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=300) as response:
        return response.read()

def materialize(kind, manifest, root_dir):
    os.makedirs(root_dir, exist_ok=True)
    count = 0
    total = 0
    for entry in manifest.get("entries", []):
        rel = safe_rel_path(entry.get("path", ""))
        target = os.path.join(root_dir, rel)
        parent = os.path.dirname(target)
        if parent:
            os.makedirs(parent, exist_ok=True)

        blob = download_bytes(entry["download_url"])
        expected_size = int(entry["size"])
        if len(blob) != expected_size:
            raise RuntimeError(kind + " blob size mismatch for " + rel)
        actual_hash = hashlib.sha256(blob).hexdigest()
        expected_hash = str(entry["sha256"])
        if actual_hash != expected_hash:
            raise RuntimeError(kind + " blob hash mismatch for " + rel)

        with open(target, "wb") as fh:
            fh.write(blob)
        try:
            os.chmod(target, int(entry.get("mode", 420)))
        except Exception:
            pass

        count += 1
        total += len(blob)
    return count, total

def extract_data_bundle(root_dir):
    archive_rel = "__tahuna__/data_bundle.tar.gz"
    archive_path = os.path.join(root_dir, archive_rel)
    if not os.path.isfile(archive_path):
        return 0, 0, 0

    archive_size = os.path.getsize(archive_path)
    extracted_count = 0
    extracted_bytes = 0
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if not member.isfile():
                raise RuntimeError("data archive contains unsupported entry type: " + str(member.name))
            rel = safe_rel_path(member.name)
            target = os.path.join(root_dir, rel)
            parent = os.path.dirname(target)
            if parent:
                os.makedirs(parent, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise RuntimeError("data archive entry missing bytes: " + rel)
            blob = source.read()
            with open(target, "wb") as fh:
                fh.write(blob)
            try:
                os.chmod(target, int(member.mode) & 0o777)
            except Exception:
                pass
            extracted_count += 1
            extracted_bytes += len(blob)

    try:
        os.remove(archive_path)
    except Exception:
        pass
    try:
        bundle_dir = os.path.dirname(archive_path)
        if os.path.isdir(bundle_dir) and not os.listdir(bundle_dir):
            os.rmdir(bundle_dir)
    except Exception:
        pass
    return extracted_count, extracted_bytes, archive_size

def unquote(value):
    text = str(value).strip()
    if len(text) >= 2 and ((text[0] == '"' and text[-1] == '"') or (text[0] == "'" and text[-1] == "'")):
        return text[1:-1]
    return text

def load_command_from_config():
    config_candidates = [
        os.path.join(WORKSPACE_ROOT, "config.yaml"),
        os.path.join(WORKSPACE_ROOT, "config.yml"),
    ]
    for config_path in config_candidates:
        if not os.path.isfile(config_path):
            continue
        command = []
        in_command = False
        with open(config_path, "r", encoding="utf-8") as fh:
            for line in fh:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                if not in_command:
                    if stripped == "command:":
                        in_command = True
                    continue
                if not line.startswith((" ", "\t")):
                    break
                if stripped.startswith("- "):
                    value = unquote(stripped[2:])
                    if value:
                        command.append(value)
        if command:
            return command, config_path
    return [], ""

def normalize_command(command):
    if not command:
        return ["python3", "-u", "train.py"]
    resolved = list(command)
    first = (resolved[0] or "").strip().lower()
    if first in ("python", "python3"):
        resolved[0] = "python3"
        if len(resolved) < 2 or resolved[1] != "-u":
            resolved.insert(1, "-u")
    return resolved

def install_requirements():
    requirements_path = os.path.join(WORKSPACE_ROOT, "requirements.txt")
    if not os.path.isfile(requirements_path):
        emit_logs(["bootstrap: no requirements.txt found (skipping install)"], source="bootstrap")
        return

    emit_logs(["bootstrap: installing dependencies from requirements.txt"], source="bootstrap")
    proc = subprocess.Popen(
        ["python3", "-m", "pip", "install", "-r", requirements_path],
        cwd=WORKSPACE_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    for line in proc.stdout:
        text = line.rstrip("\n")
        if text:
            emit_logs([text], source="bootstrap")

    code = proc.wait()
    if code != 0:
        raise RuntimeError("requirements install failed with status " + str(code))
    emit_logs(["bootstrap: dependency install complete"], source="bootstrap")

def run_training():
    command, source_config = load_command_from_config()
    normalized_command = normalize_command(command)
    if source_config:
        emit_logs(["using command from " + source_config + ": " + " ".join(normalized_command)], source="train")
    else:
        emit_logs(["no config command found; using default: " + " ".join(normalized_command)], source="train")

    entrypoint = ""
    for token in normalized_command[1:]:
        if str(token).strip().endswith(".py"):
            entrypoint = str(token).strip()
            break
    if not entrypoint:
        entrypoint = "train.py"
    entrypoint_path = os.path.join(WORKSPACE_ROOT, entrypoint)
    if entrypoint and entrypoint.endswith(".py") and not os.path.isfile(entrypoint_path):
        emit_logs(["no entrypoint found at " + entrypoint_path + " (bootstrap only)"], source="train")
        return 0

    emit_logs(["starting entrypoint"], source="train")
    proc = subprocess.Popen(
        normalized_command,
        cwd=WORKSPACE_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    metric_pattern = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)=([-+]?(?:\\d+\\.\\d+|\\d+))")
    step = 0
    for line in proc.stdout:
        text = line.rstrip("\n")
        if text:
            emit_logs([text], source="train")
            samples = []
            for match in metric_pattern.finditer(text):
                samples.append(
                    {
                        "name": match.group(1),
                        "value": float(match.group(2)),
                        "step": step,
                        "source": "train",
                    }
                )
            if samples:
                emit_metrics(samples)
        step += 1

    return proc.wait()

def upload_artifacts():
    output_dir = os.path.join(WORKSPACE_ROOT, "outputs")
    if not os.path.isdir(output_dir):
        emit_logs(["artifacts: no outputs directory found at " + output_dir + " (skipping upload)"], source="bootstrap")
        return []

    file_list = []
    for dirpath, _dirnames, filenames in os.walk(output_dir):
        for fname in filenames:
            full_path = os.path.join(dirpath, fname)
            rel = os.path.relpath(full_path, output_dir)
            size = os.path.getsize(full_path)
            if size > 0:
                file_list.append({"path": full_path, "name": rel, "size": size})

    if not file_list:
        emit_logs(["artifacts: outputs directory is empty (skipping upload)"], source="bootstrap")
        return []

    emit_logs(["artifacts: found " + str(len(file_list)) + " output file(s) to upload"], source="bootstrap")

    artifacts_payload = [{"name": f["name"], "size_bytes": f["size"]} for f in file_list]
    try:
        url_resp = api_request("POST", "/api/runs/" + RUN_ID + "/runtime/artifacts/upload-url", {"artifacts": artifacts_payload})
    except Exception as err:
        emit_logs(["artifacts: failed to get upload URLs: " + str(err)], level="warn", source="bootstrap")
        return []

    uploads = url_resp.get("uploads", [])
    if not uploads:
        emit_logs(["artifacts: no upload URLs returned"], level="warn", source="bootstrap")
        return []

    upload_map = {}
    for u in uploads:
        upload_map[u.get("name", "")] = u

    uploaded_keys = []
    for f in file_list:
        upload_info = upload_map.get(f["name"])
        if not upload_info:
            emit_logs(["artifacts: no upload URL for " + f["name"] + " (skipping)"], level="warn", source="bootstrap")
            continue
        try:
            with open(f["path"], "rb") as fh:
                data = fh.read()
            put_req = urllib.request.Request(upload_info["url"], data=data, method="PUT")
            put_req.add_header("Content-Type", "application/octet-stream")
            with urllib.request.urlopen(put_req, timeout=600) as _resp:
                pass
            uploaded_keys.append(upload_info["key"])
            emit_logs(["artifacts: uploaded " + f["name"] + " (" + str(len(data)) + " bytes)"], source="bootstrap")
        except Exception as err:
            emit_logs(["artifacts: upload failed for " + f["name"] + ": " + str(err)], level="warn", source="bootstrap")

    if uploaded_keys:
        try:
            api_request("POST", "/api/runs/" + RUN_ID + "/runtime/artifacts/commit", {"keys": uploaded_keys})
            emit_logs(["artifacts: committed " + str(len(uploaded_keys)) + " artifact key(s)"], source="bootstrap")
        except Exception as err:
            emit_logs(["artifacts: commit failed: " + str(err)], level="warn", source="bootstrap")

    emit_metrics([{"name": "artifacts_uploaded", "value": float(len(uploaded_keys)), "source": "bootstrap"}])
    return uploaded_keys

try:
    emit_status("provisioning", "in-pod bootstrap started")
    emit_logs(["bootstrap: requesting materialization plan"])
    plan = api_request("GET", "/api/runs/" + RUN_ID + "/runtime/bootstrap")
    code_count, code_bytes = materialize("code", plan["code"], WORKSPACE_ROOT)
    data_count, data_bytes = materialize("data", plan["data"], DATA_ROOT)
    bundle_files, bundle_bytes, bundle_archive_size = extract_data_bundle(DATA_ROOT)
    if bundle_files > 0:
        data_count = max(0, data_count - 1) + bundle_files
        data_bytes = max(0, data_bytes - bundle_archive_size) + bundle_bytes
        emit_logs(["bootstrap: extracted data bundle files=" + str(bundle_files)], source="bootstrap")
    emit_logs(["bootstrap: materialized code files=" + str(code_count) + " data files=" + str(data_count)])
    emit_metrics(
        [
            {"name": "bootstrap_code_files", "value": float(code_count), "source": "bootstrap"},
            {"name": "bootstrap_code_bytes", "value": float(code_bytes), "source": "bootstrap"},
            {"name": "bootstrap_data_files", "value": float(data_count), "source": "bootstrap"},
            {"name": "bootstrap_data_bytes", "value": float(data_bytes), "source": "bootstrap"},
        ]
    )
    install_requirements()
    emit_status("running", "workspace materialized")
    exit_code = run_training()
    if exit_code == 0:
        upload_artifacts()
        emit_status("completed", "entrypoint completed")
    else:
        emit_status("failed", "entrypoint failed", "entrypoint exited with status " + str(exit_code))
    raise SystemExit(exit_code)
except Exception as err:
    message = str(err).strip() or "bootstrap failed"
    emit_logs(["bootstrap failed: " + message], level="error")
    emit_status("failed", "bootstrap failed", message)
    raise
PY
python3 /tmp/tahuna_bootstrap.py`;
}

async function createRunpodPod(args: {
  runId: string;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  runtimeToken: string;
  payload: ProvisioningPayload;
}) {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RUNPOD_API_KEY is not set");
  }
  const cloudType = (process.env.RUNPOD_CLOUD_TYPE?.trim().toUpperCase() || "SECURE");
  const allowedCloudType = cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
  const gpuTypeId = await resolveRunpodGpuTypeId(apiKey, args.gpuType);
  const runtimeApiBase = resolveRuntimeApiBase();
  const bootstrapCommand = buildPodBootstrapStartCommand();

  const response = await fetch("https://rest.runpod.io/v1/pods", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `tahuna-${args.runId}`,
      computeType: "GPU",
      cloudType: allowedCloudType,
      gpuCount: Math.max(1, args.gpuCount),
      gpuTypeIds: [gpuTypeId],
      gpuTypePriority: "custom",
      imageName: args.imageName,
      volumeInGb: Math.max(1, args.volumeGb),
      volumeMountPath: "/workspace",
      env: {
        TAHUNA_RUN_ID: args.payload.run_id,
        TAHUNA_ENVIRONMENT_ID: args.payload.environment_id,
        TAHUNA_CONTRACT_VERSION: args.payload.contract_version,
        TAHUNA_INPUT_PATH: args.payload.input_path,
        TAHUNA_OUTPUT_PATH: args.payload.output_path,
        TAHUNA_LOGS_PATH: args.payload.logs_path,
        TAHUNA_CODE_MANIFEST_HASH: args.payload.code_manifest_hash || "",
        TAHUNA_DATA_MANIFEST_HASH: args.payload.data_manifest_hash || "",
        TAHUNA_CODE_MANIFEST_KEY: args.payload.code_manifest_key || "",
        TAHUNA_DATA_MANIFEST_KEY: args.payload.data_manifest_key || "",
        TAHUNA_API_BASE: runtimeApiBase,
        TAHUNA_RUNTIME_TOKEN: args.runtimeToken,
        TAHUNA_WORKSPACE_ROOT: "/workspace",
      },
      dockerEntrypoint: ["/bin/bash", "-lc"],
      dockerStartCmd: [bootstrapCommand],
      ports: ["22/tcp", "8888/http"],
    }),
  });
  const rawText = await response.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
        ? String((body as Record<string, unknown>).message)
        : (rawText.trim() || `http ${response.status}`);
    throw new Error(`Runpod pod creation failed: ${detail}`);
  }
  const row = (body || {}) as Record<string, unknown>;
  const podId = typeof row.id === "string" ? row.id : (typeof row.podId === "string" ? row.podId : "");
  if (!podId) {
    throw new Error("Runpod pod creation failed: missing pod id in response");
  }
  return {
    podId,
    rawResponse: row,
  };
}

function normalizeGpuLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveRunpodGpuTypeId(apiKey: string, requestedGpu: string) {
  const trimmed = requestedGpu.trim();
  if (!trimmed) {
    throw new Error("GPU type is empty");
  }
  const res = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: "query { gpuTypes { id displayName } }",
    }),
  });
  if (!res.ok) {
    throw new Error(`failed to fetch Runpod GPU catalog: http ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("failed to parse Runpod GPU catalog response");
  }
  const typesRaw =
    json && typeof json === "object" && "data" in json
      ? (json as { data?: { gpuTypes?: Array<{ id?: string; displayName?: string }> } }).data?.gpuTypes
      : undefined;
  const gpuTypes = Array.isArray(typesRaw) ? typesRaw : [];
  if (gpuTypes.length === 0) {
    throw new Error("Runpod GPU catalog is empty");
  }

  const requestedNorm = normalizeGpuLabel(trimmed);
  const directMatch = gpuTypes.find((gpu) => typeof gpu.id === "string" && gpu.id === trimmed);
  if (directMatch?.id) {
    return directMatch.id;
  }
  const displayMatch = gpuTypes.find(
    (gpu) => typeof gpu.displayName === "string" && normalizeGpuLabel(gpu.displayName) === requestedNorm,
  );
  if (displayMatch?.id) {
    return displayMatch.id;
  }

  const sample = gpuTypes
    .slice(0, 10)
    .map((gpu) => gpu.displayName || gpu.id || "")
    .filter(Boolean)
    .join(", ");
  throw new Error(`Runpod GPU type not found: "${trimmed}". Available examples: ${sample}`);
}

async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    runs: rows.sort((a, b) => b._creationTime - a._creationTime).map(toRunResponse),
  };
}

async function getOwnedRun(ctx: QueryCtx | MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await ctx.db.get("runs", runId);
  if (!row || row.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return row;
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const env = await ctx.db.get("environments", environmentId);
  if (!env || env.userId !== userId) {
    throw new ConvexError("environment not found");
  }
  return env;
}

async function listRecentRuntimeLogs(ctx: QueryCtx, runId: Id<"runs">) {
  const rows = await ctx.db
    .query("runRuntimeLogs")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .order("desc")
    .take(RUNTIME_LOG_TAIL_LIMIT);
  return rows
    .slice()
    .reverse()
    .map((row) => ({
      timestamp: row.timestamp,
      level: row.level,
      source: row.source,
      message: row.message,
    }));
}

async function listRecentRuntimeMetrics(ctx: QueryCtx, runId: Id<"runs">) {
  const rows = await ctx.db
    .query("runRuntimeMetrics")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .order("desc")
    .take(RUNTIME_METRIC_TAIL_LIMIT);
  return rows
    .slice()
    .reverse()
    .map((row) => ({
      timestamp: row.timestamp,
      name: row.name,
      value: row.value,
      step: row.step ?? null,
      unit: row.unit ?? null,
      source: row.source,
    }));
}

async function toRunLogsResponse(ctx: QueryCtx, row: Doc<"runs">) {
  const [recentLogs, recentMetrics] = await Promise.all([
    listRecentRuntimeLogs(ctx, row._id),
    listRecentRuntimeMetrics(ctx, row._id),
  ]);
  return {
    run_id: String(row._id),
    logs_path: row.logs,
    log_file: `${row.logs}/run.log`,
    note: "Runtime logs/metrics are streamed by the pod and persisted in Convex.",
    recent_logs: recentLogs,
    recent_metrics: recentMetrics,
  };
}

async function createRunForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
    enqueue_provisioning?: boolean;
  },
) {
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
  const codeManifestHash = env.latestCodeManifestHash;
  const dataManifestHash = env.latestDataManifestHash;
  const dataId = env.dataId || String(env._id);
  if (!codeManifestHash || !dataManifestHash) {
    throw new ConvexError("environment is not synced; run `tahuna sync` before creating a run");
  }

  const now = Date.now();
  const runId = await ctx.db.insert("runs", {
    userId: args.userId,
    environmentId: args.environmentId,
    dataId,
    input: `runs/${args.environmentId}/${now}/input`,
    output: `runs/${args.environmentId}/${now}/output`,
    logs: `runs/${args.environmentId}/${now}/logs`,
    status: RUN_STATUS.PROVISIONING,
    cancellationRequested: false,
    effectiveGpuType: args.gpu_type ?? env.gpuType,
    effectiveGpuCount: args.gpu_count ?? env.gpuCount,
    effectiveVolumeGb: args.volume_gb ?? env.volumeGb,
    codeManifestHash: codeManifestHash,
    dataManifestHash: dataManifestHash,
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: RUN_STATUS.PROVISIONING,
    message: "run submitted for provisioning",
    metadata: {
      gpu_type: args.gpu_type || env.gpuType,
      gpu_count: args.gpu_count ?? env.gpuCount,
      volume_gb: args.volume_gb ?? env.volumeGb,
      code_manifest_hash: codeManifestHash || null,
      data_manifest_hash: dataManifestHash || null,
    },
  });

  if (args.enqueue_provisioning ?? true) {
    await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
  }
  const row = await ctx.db.get("runs", runId);
  if (!row) {
    throw new ConvexError("failed to create run");
  }
  return toRunResponse(row);
}

async function removeRunForUserId(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await getOwnedRun(ctx, userId, runId);

  if (ACTIVE_STATUSES.has(row.status)) {
    await ctx.db.patch("runs", runId, {
      status: RUN_STATUS.CANCELLING,
      cancellationRequested: true,
    });
    await ctx.db.insert("runEvents", {
      runId,
      status: RUN_STATUS.CANCELLING,
      message: "cancellation requested",
    });
    return { cancel_requested: true, run_id: String(runId) };
  }

  const [events, runtimeLogs, runtimeMetrics] = await Promise.all([
    ctx.db
      .query("runEvents")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
    ctx.db
      .query("runRuntimeLogs")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
    ctx.db
      .query("runRuntimeMetrics")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .collect(),
  ]);
  await Promise.all([
    ...events.map((event) => ctx.db.delete(event._id)),
    ...runtimeLogs.map((entry) => ctx.db.delete(entry._id)),
    ...runtimeMetrics.map((entry) => ctx.db.delete(entry._id)),
  ]);
  await ctx.db.delete("runs", runId);
  return { deleted: true, run_id: String(runId) };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  returns: listRunsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return toRunLogsResponse(ctx, row);
  },
});

export const internalGetLogs = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return toRunLogsResponse(ctx, row);
  },
});

export const create = mutation({
  args: {
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createRunForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
    });
  },
});

export const remove = mutation({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeRunForUserId(ctx, String(user._id), args.runId);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listRunsResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return toRunResponse(row);
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
    enqueue_provisioning: v.optional(v.boolean()),
  },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    return createRunForUserId(ctx, args);
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    return removeRunForUserId(ctx, args.userId, args.runId);
  },
});

// ---------- internal lifecycle ----------

export const internalGetProvisioningPayload = internalQuery({
  args: { runId: v.id("runs") },
  returns: provisioningPayloadValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      throw new ConvexError("run not found");
    }
    return toProvisioningPayload(row);
  },
});

export const internalGetRunProvisionSpec = internalQuery({
  args: { runId: v.id("runs") },
  returns: runProvisionSpecValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      throw new ConvexError("run not found");
    }
    const env = await ctx.db.get("environments", row.environmentId);
    if (!env) {
      throw new ConvexError("environment not found");
    }
    return {
      run_id: String(row._id),
      effective_gpu_type: row.effectiveGpuType || env.gpuType,
      effective_gpu_count: row.effectiveGpuCount || env.gpuCount,
      effective_volume_gb: row.effectiveVolumeGb || env.volumeGb,
      framework: env.framework,
      version: env.version,
    };
  },
});

export const internalValidateRuntimeToken = internalQuery({
  args: { runId: v.id("runs"), tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || !row.runtimeTokenHash) {
      return false;
    }
    return row.runtimeTokenHash === args.tokenHash;
  },
});

export const internalGetRuntimeBootstrapPlan = internalAction({
  args: { runId: v.id("runs") },
  returns: runtimeBootstrapPlanValidator,
  handler: async (ctx, args): Promise<RuntimeBootstrapPlan> => {
    const provisioningPayload: ProvisioningPayload = await ctx.runQuery(
      internal.runs.internalGetProvisioningPayload,
      {
        runId: args.runId,
      },
    );
    const codeManifestHash = provisioningPayload.code_manifest_hash;
    const dataManifestHash = provisioningPayload.data_manifest_hash;
    const codeManifestKey = provisioningPayload.code_manifest_key;
    const dataManifestKey = provisioningPayload.data_manifest_key;
    if (!codeManifestHash || !dataManifestHash || !codeManifestKey || !dataManifestKey) {
      throw new Error("missing pinned manifest hash/key in provisioning payload");
    }

    const codeManifest = await fetchManifest(ctx, "code", codeManifestKey, codeManifestHash);
    const dataManifest = await fetchManifest(ctx, "data", dataManifestKey, dataManifestHash);
    const codeEntries = await resolveManifestDownloadEntries(ctx, provisioningPayload, "code", codeManifest);
    const dataEntries = await resolveManifestDownloadEntries(ctx, provisioningPayload, "data", dataManifest);

    return {
      run_id: provisioningPayload.run_id,
      contract_version: provisioningPayload.contract_version,
      workspace_root: "/workspace",
      code: {
        manifest_hash: codeManifestHash,
        entries: codeEntries,
      },
      data: {
        manifest_hash: dataManifestHash,
        entries: dataEntries,
      },
    };
  },
});

export const setRuntimeTokenHash = internalMutation({
  args: { runId: v.id("runs"), runtimeTokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    await ctx.db.patch("runs", args.runId, { runtimeTokenHash: args.runtimeTokenHash });
    return null;
  },
});

export const provisionRun = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const provisioningPayload = await ctx.runQuery(internal.runs.internalGetProvisioningPayload, {
      runId: args.runId,
    });
    const runSpec = await ctx.runQuery(internal.runs.internalGetRunProvisionSpec, {
      runId: args.runId,
    });
    await ctx.runMutation(internal.runs.markProvisioning, {
      runId: args.runId,
      provisioningPayload,
    });
    try {
      const codeManifestHash = provisioningPayload.code_manifest_hash;
      const dataManifestHash = provisioningPayload.data_manifest_hash;
      const codeManifestKey = provisioningPayload.code_manifest_key;
      const dataManifestKey = provisioningPayload.data_manifest_key;
      if (!codeManifestHash || !dataManifestHash || !codeManifestKey || !dataManifestKey) {
        throw new Error("missing pinned manifest hash/key in provisioning payload");
      }

      const codeManifest = await fetchManifest(ctx, "code", codeManifestKey, codeManifestHash);
      const dataManifest = await fetchManifest(ctx, "data", dataManifestKey, dataManifestHash);
      const codeStats = summarizeManifest(codeManifest);
      const dataStats = summarizeManifest(dataManifest);
      const runtimeToken = generateRuntimeToken();
      const runtimeTokenHash = await sha256Hex(runtimeToken);
      await ctx.runMutation(internal.runs.setRuntimeTokenHash, {
        runId: args.runId,
        runtimeTokenHash,
      });
      const imageName = resolveImageName(runSpec.framework, runSpec.version);
      const provisionResult = await createRunpodPod({
        runId: String(args.runId),
        imageName,
        gpuType: runSpec.effective_gpu_type,
        gpuCount: runSpec.effective_gpu_count,
        volumeGb: runSpec.effective_volume_gb,
        runtimeToken,
        payload: provisioningPayload,
      });
      await ctx.runMutation(internal.runs.markPodProvisioned, {
        runId: args.runId,
        podId: provisionResult.podId,
        runpodResponse: provisionResult.rawResponse,
      });

      await ctx.runMutation(internal.runs.markRunning, {
        runId: args.runId,
        provisioningPayload: {
          ...provisioningPayload,
          bootstrap_summary: {
            code_files: codeStats.fileCount,
            code_bytes: codeStats.totalBytes,
            data_files: dataStats.fileCount,
            data_bytes: dataStats.totalBytes,
          },
          runpod_pod_id: provisionResult.podId,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "pod bootstrap failed";
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.runId,
        error: `pod bootstrap failed: ${detail}`,
        provisioningPayload,
      });
    }
    return null;
  },
});

export const markPodProvisioned = internalMutation({
  args: {
    runId: v.id("runs"),
    podId: v.string(),
    runpodResponse: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    await ctx.db.patch("runs", args.runId, {
      podId: args.podId,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.PROVISIONING,
      message: "gpu pod provisioned",
      metadata: {
        pod_id: args.podId,
        runpod_response: args.runpodResponse,
      },
    });
    return null;
  },
});

export const markProvisioning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        await ctx.db.patch("runs", args.runId, { status: RUN_STATUS.CANCELLED });
      }
      return null;
    }
    await ctx.db.patch("runs", args.runId, { status: RUN_STATUS.PROVISIONING });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.PROVISIONING,
      message: "pod bootstrap started",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod bootstrap downloads pinned code/data manifests and blobs into /workspace",
          }
        : undefined,
    });
    return null;
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        await ctx.db.patch("runs", args.runId, { status: RUN_STATUS.CANCELLED });
      }
      return null;
    }

    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.RUNNING,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.RUNNING,
      message: "pod running",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod runtime is active and reporting logs/metrics via runtime endpoints",
          }
        : undefined,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    runId: v.id("runs"),
    error: v.string(),
    provisioningPayload: v.optional(provisioningPayloadValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    const errorText = args.error.trim() || "pod bootstrap failed";
    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.FAILED,
      error: errorText,
      runtimeTokenHash: "revoked",
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.FAILED,
      message: errorText,
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
          }
        : undefined,
    });
    return null;
  },
});

export const ingestRuntimeLogs = internalMutation({
  args: {
    runId: v.id("runs"),
    lines: v.array(runtimeLogLineValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    let accepted = 0;
    for (const line of args.lines.slice(0, 500)) {
      const message = sanitizeRuntimeMessage(line.message);
      if (!message) {
        continue;
      }
      await ctx.db.insert("runRuntimeLogs", {
        runId: args.runId,
        timestamp: normalizeRuntimeTimestamp(line.timestamp),
        level: normalizeRuntimeLevel(line.level),
        source: normalizeRuntimeSource(line.source),
        message,
      });
      accepted += 1;
    }
    return { accepted };
  },
});

export const ingestRuntimeMetrics = internalMutation({
  args: {
    runId: v.id("runs"),
    metrics: v.array(runtimeMetricSampleValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    let accepted = 0;
    for (const metric of args.metrics.slice(0, 500)) {
      const name = metric.name.trim().slice(0, 120);
      if (!name || !Number.isFinite(metric.value)) {
        continue;
      }
      await ctx.db.insert("runRuntimeMetrics", {
        runId: args.runId,
        timestamp: normalizeRuntimeTimestamp(metric.timestamp),
        name,
        value: metric.value,
        step:
          typeof metric.step === "number" && Number.isFinite(metric.step)
            ? Math.floor(metric.step)
            : undefined,
        unit: metric.unit?.trim() ? metric.unit.trim().slice(0, 32) : undefined,
        source: normalizeRuntimeSource(metric.source),
      });
      accepted += 1;
    }
    return { accepted };
  },
});

export const ingestRuntimeStatus = internalMutation({
  args: {
    runId: v.id("runs"),
    status: runtimeStatusValidator,
    message: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { status: "missing" };
    }
    if (TERMINAL_STATUSES.has(row.status)) {
      return { status: row.status };
    }

    let status = args.status;
    if (row.cancellationRequested && (status === RUN_STATUS.PROVISIONING || status === RUN_STATUS.RUNNING)) {
      status = RUN_STATUS.CANCELLED;
    }
    if (row.status === RUN_STATUS.RUNNING && status === RUN_STATUS.PROVISIONING) {
      status = RUN_STATUS.RUNNING;
    }

    if (status === RUN_STATUS.FAILED) {
      const errorText = sanitizeRuntimeMessage(args.error || args.message || "runtime failed") || "runtime failed";
      await ctx.db.patch("runs", args.runId, {
        status: RUN_STATUS.FAILED,
        error: errorText,
        runtimeTokenHash: "revoked",
      });
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        status: RUN_STATUS.FAILED,
        message: errorText,
        metadata: {
          source: "pod-runtime",
        },
      });
      return { status: RUN_STATUS.FAILED };
    }

    const patch: { status: string; runtimeTokenHash?: string } = { status };
    if (status === RUN_STATUS.COMPLETED || status === RUN_STATUS.CANCELLED) {
      patch.runtimeTokenHash = "revoked";
    }
    await ctx.db.patch("runs", args.runId, patch);
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status,
      message:
        sanitizeRuntimeMessage(args.message || `runtime status: ${status}`) ||
        `runtime status: ${status}`,
      metadata: {
        source: "pod-runtime",
      },
    });
    return { status };
  },
});

export const completeRun = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }

    const terminal = row.cancellationRequested ? RUN_STATUS.CANCELLED : RUN_STATUS.COMPLETED;
    await ctx.db.patch("runs", args.runId, {
      status: terminal,
      runtimeTokenHash: "revoked",
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: terminal,
      message: terminal === RUN_STATUS.COMPLETED ? "run completed" : "run cancelled",
    });
    return null;
  },
});

export const ingestRuntimeArtifacts = internalMutation({
  args: {
    runId: v.id("runs"),
    keys: v.array(v.string()),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    const existing = row.artifactKeys || [];
    const seen = new Set(existing);
    const newKeys: string[] = [];
    for (const key of args.keys) {
      const trimmed = key.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        newKeys.push(trimmed);
      }
    }
    if (newKeys.length > 0) {
      await ctx.db.patch("runs", args.runId, {
        artifactKeys: [...existing, ...newKeys],
      });
    }
    return { accepted: newKeys.length };
  },
});

export const internalGetRunOutputPath = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    return row.output || null;
  },
});
