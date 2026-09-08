export const ENVIRONMENT_CONFIG_FILE_NAME = "tahuna.toml";

export type EnvironmentConfigValues = {
  name: string;
  framework: string;
  version: string;
  python_version: string;
  gpu_type: string;
  gpu_count: number;
  volume_gb: number;
};

const ENVIRONMENT_SECTION = "environment";
const STRING_KEYS = new Set<keyof EnvironmentConfigValues>([
  "name",
  "framework",
  "version",
  "python_version",
  "gpu_type",
]);
const NUMBER_KEYS = new Set<keyof EnvironmentConfigValues>(["gpu_count", "volume_gb"]);
const REQUIRED_KEYS: Array<keyof EnvironmentConfigValues> = [
  "name",
  "framework",
  "version",
  "python_version",
  "gpu_type",
  "gpu_count",
  "volume_gb",
];

function escapeTomlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTomlString(raw: string, lineNumber: number) {
  if (raw.length < 2) {
    throw new Error(`line ${lineNumber}: expected quoted string value`);
  }

  const quote = raw[0];
  if ((quote !== '"' && quote !== "'") || raw[raw.length - 1] !== quote) {
    throw new Error(`line ${lineNumber}: expected quoted string value`);
  }

  const inner = raw.slice(1, -1);
  if (quote === "'") {
    return inner;
  }

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseTomlPositiveInteger(raw: string, lineNumber: number) {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`line ${lineNumber}: expected a positive integer`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`line ${lineNumber}: expected a positive integer`);
  }
  return parsed;
}

export function renderEnvironmentConfig(values: EnvironmentConfigValues) {
  return [
    "# Generated from the remote Tahuna environment record.",
    `[${ENVIRONMENT_SECTION}]`,
    `name = "${escapeTomlString(values.name)}"`,
    `framework = "${escapeTomlString(values.framework)}"`,
    `version = "${escapeTomlString(values.version)}"`,
    `python_version = "${escapeTomlString(values.python_version)}"`,
    `gpu_type = "${escapeTomlString(values.gpu_type)}"`,
    `gpu_count = ${values.gpu_count}`,
    `volume_gb = ${values.volume_gb}`,
  ].join("\n");
}

export function parseEnvironmentConfig(text: string): EnvironmentConfigValues {
  const parsed: Partial<EnvironmentConfigValues> = {};
  const seen = new Set<keyof EnvironmentConfigValues>();
  let section = "";

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).trim();
      if (section !== ENVIRONMENT_SECTION) {
        throw new Error(`line ${lineNumber}: unsupported section [${section}]`);
      }
      continue;
    }

    if (section !== ENVIRONMENT_SECTION) {
      throw new Error(`line ${lineNumber}: expected [${ENVIRONMENT_SECTION}] section before config values`);
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      throw new Error(`line ${lineNumber}: expected key = value`);
    }

    const key = line.slice(0, separator).trim() as keyof EnvironmentConfigValues;
    const rawValue = line.slice(separator + 1).trim();
    if (!STRING_KEYS.has(key) && !NUMBER_KEYS.has(key)) {
      throw new Error(`line ${lineNumber}: unsupported key ${String(key)}`);
    }
    if (seen.has(key)) {
      throw new Error(`line ${lineNumber}: duplicate key ${String(key)}`);
    }

    if (STRING_KEYS.has(key)) {
      parsed[key] = parseTomlString(rawValue, lineNumber) as never;
    } else {
      parsed[key] = parseTomlPositiveInteger(rawValue, lineNumber) as never;
    }
    seen.add(key);
  }

  if (section !== ENVIRONMENT_SECTION) {
    throw new Error(`missing [${ENVIRONMENT_SECTION}] section`);
  }

  for (const key of REQUIRED_KEYS) {
    if (typeof parsed[key] === "undefined") {
      throw new Error(`missing required key ${String(key)}`);
    }
  }

  return parsed as EnvironmentConfigValues;
}
