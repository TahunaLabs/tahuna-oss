import { ConvexError } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";

const RUN_NAME_MAX_LENGTH = 64;
const RUN_NAME_FIRST = [
  "amber",
  "brisk",
  "crisp",
  "drift",
  "ember",
  "frost",
  "golden",
  "lively",
  "mellow",
  "rapid",
  "solar",
  "vivid",
];
const RUN_NAME_SECOND = [
  "cloud",
  "field",
  "forest",
  "harbor",
  "meadow",
  "mesa",
  "orbit",
  "river",
  "summit",
  "trail",
  "valley",
  "wave",
];
const RUN_NAME_THIRD = [
  "bear",
  "eagle",
  "falcon",
  "fox",
  "lynx",
  "otter",
  "owl",
  "panda",
  "raven",
  "tiger",
  "wolf",
  "yak",
];

export function normalizeRunName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function validateRunName(value: string) {
  const normalized = normalizeRunName(value);
  if (!normalized) {
    throw new ConvexError("run name is required");
  }
  if (normalized.length > RUN_NAME_MAX_LENGTH) {
    throw new ConvexError(`run name must be <= ${RUN_NAME_MAX_LENGTH} characters`);
  }
  return normalized;
}

export function fallbackRunName(runId: Id<"runs">) {
  return `run-${String(runId).slice(0, 8)}`;
}

export function getRunName(row: Doc<"runs">) {
  const normalized = row.name ? normalizeRunName(row.name) : "";
  return normalized || fallbackRunName(row._id);
}

function randomWord(list: string[]) {
  return list[Math.floor(Math.random() * list.length)] || "run";
}

function generateWordRunName() {
  return `${randomWord(RUN_NAME_FIRST)}-${randomWord(RUN_NAME_SECOND)}-${randomWord(RUN_NAME_THIRD)}`;
}

export function hasRunNameConflict(
  rows: Array<Doc<"runs">>,
  candidate: string,
  ignoreRunId?: Id<"runs">,
) {
  const normalizedCandidate = normalizeRunName(candidate);
  if (!normalizedCandidate) {
    return false;
  }
  return rows.some((row) => {
    if (ignoreRunId && row._id === ignoreRunId) {
      return false;
    }
    return normalizeRunName(row.name || "") === normalizedCandidate;
  });
}

function appendRunNameSuffix(base: string, suffix: number) {
  if (suffix <= 1) {
    return base;
  }
  const suffixText = `-${suffix}`;
  const available = RUN_NAME_MAX_LENGTH - suffixText.length;
  if (available <= 1) {
    return `run${suffixText}`;
  }
  return `${base.slice(0, available)}${suffixText}`;
}

export function pickUniqueGeneratedRunName(rows: Array<Doc<"runs">>) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = generateWordRunName();
    if (!hasRunNameConflict(rows, candidate)) {
      return candidate;
    }
  }

  const base = generateWordRunName();
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = appendRunNameSuffix(base, suffix);
    if (!hasRunNameConflict(rows, candidate)) {
      return candidate;
    }
  }
  return `run-${Date.now().toString(36)}`;
}
