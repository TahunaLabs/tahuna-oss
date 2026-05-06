export function toUnixMillis(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function toOptionalUnixMillis(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

export function resolveRunUptimeMs(
  run: {
    computeStartedAt?: number;
    computeEndedAt?: number;
    status?: string;
  },
  terminalStatuses: ReadonlySet<string>,
  nowMs = Date.now(),
) {
  const startedAt = toOptionalUnixMillis(run.computeStartedAt);
  if (startedAt === undefined) {
    return 0;
  }
  const endedAt = toOptionalUnixMillis(run.computeEndedAt);
  if (endedAt === undefined && run.status && terminalStatuses.has(run.status)) {
    return 0;
  }
  const resolvedEndedAt = endedAt ?? Math.max(startedAt, toUnixMillis(nowMs));
  return Math.max(0, resolvedEndedAt - startedAt);
}

export function resolveTerminalRunTiming(
  run: {
    computeStartedAt?: number;
    computeEndedAt?: number;
  },
  nowMs = Date.now(),
) {
  const startedAt = toOptionalUnixMillis(run.computeStartedAt);
  const existingEndedAt = toOptionalUnixMillis(run.computeEndedAt);
  if (startedAt === undefined) {
    return {
      computeEndedAt: existingEndedAt,
      durationMs: 0,
    };
  }
  const computeEndedAt = existingEndedAt ?? Math.max(startedAt, toUnixMillis(nowMs));
  return {
    computeEndedAt,
    durationMs: Math.max(0, computeEndedAt - startedAt),
  };
}
