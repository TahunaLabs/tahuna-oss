import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  apiKeys: defineTable({
    userId: v.string(),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    machineId: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["keyHash"]),

  environments: defineTable({
    userId: v.string(),
    name: v.string(),
    artifacts: v.string(),
    dataId: v.optional(v.string()),
    pythonVersion: v.optional(v.string()),
    boundDataIds: v.optional(v.array(v.string())),
    boundDataManifestHashes: v.optional(v.array(v.string())),
    gpuType: v.string(),
    gpuCount: v.number(),
    volumeGb: v.number(),
    framework: v.string(),
    version: v.string(),
    latestCodeManifestHash: v.optional(v.string()),
    latestDataManifestHash: v.optional(v.string()),
    latestSyncAt: v.optional(v.number()),
    command: v.array(v.string()),
    outputDir: v.string(),
    serveSnapshot: v.optional(v.object({
      command: v.array(v.string()),
      pythonVersion: v.string(),
      gpuType: v.string(),
      gpuCount: v.number(),
      volumeGb: v.number(),
      port: v.number(),
      healthPath: v.string(),
      defaultModelPath: v.string(),
      startupTimeoutSeconds: v.number(),
      healthIntervalSeconds: v.number(),
      healthTimeoutSeconds: v.number(),
      healthFailureThreshold: v.number(),
      gracefulShutdownSeconds: v.number(),
    })),
  }).index("by_user", ["userId"]),

  runs: defineTable({
    userId: v.string(),
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    command: v.optional(v.array(v.string())),
    dataId: v.optional(v.string()),
    outputDir: v.optional(v.string()),
    input: v.string(),
    output: v.string(),
    logs: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    podId: v.optional(v.string()),
    runpodCredentialId: v.optional(v.id("runpodCredentials")),
    effectiveGpuType: v.optional(v.string()),
    effectiveGpuCount: v.optional(v.number()),
    effectiveVolumeGb: v.optional(v.number()),
    codeManifestHash: v.optional(v.string()),
    dataManifestHash: v.optional(v.string()),
    runtimeTokenHash: v.optional(v.string()),
    artifactKeys: v.optional(v.array(v.string())),
    cancellationRequested: v.boolean(),
    computeStartedAt: v.optional(v.number()),
    computeEndedAt: v.optional(v.number()),
    computeHourlyRateCents: v.optional(v.number()),
    creditsReservedCents: v.optional(v.number()),
    computeChargeCents: v.optional(v.number()),
    computeCollectedCents: v.optional(v.number()),
    computeOutstandingCents: v.optional(v.number()),
    computeChargeStatus: v.optional(
      v.union(v.literal("pending"), v.literal("charged"), v.literal("owed")),
    ),
    computeChargeError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_environment", ["userId", "environmentId"])
    .index("by_status", ["status"])
    .index("by_runtime_token_hash", ["runtimeTokenHash"]),

  runpodCredentials: defineTable({
    userId: v.string(),
    keyCiphertext: v.string(),
    keyIv: v.string(),
    keyVersion: v.number(),
    keyPrefix: v.string(),
    fingerprint: v.string(),
    validatedAt: v.number(),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  runtimeIncompatibilities: defineTable({
    compatibilityKey: v.string(),
    cloudType: v.string(),
    framework: v.string(),
    version: v.string(),
    pythonVersion: v.string(),
    gpuType: v.string(),
    imageName: v.string(),
    errorCode: v.string(),
    errorDetail: v.string(),
    firstFailedAt: v.number(),
    lastFailedAt: v.number(),
    failureCount: v.number(),
    cooldownUntil: v.number(),
    lastRunId: v.optional(v.id("runs")),
    lastPodId: v.optional(v.string()),
  })
    .index("by_key", ["compatibilityKey"])
    .index("by_cooldown_until", ["cooldownUntil"]),

  storageObjects: defineTable({
    userId: v.string(),
    source: v.union(v.literal("data"), v.literal("run_artifact")),
    objectKind: v.union(v.literal("data_upload"), v.literal("data_manifest"), v.literal("run_artifact")),
    key: v.string(),
    name: v.string(),
    size: v.number(),
    createdAt: v.number(),
    runId: v.optional(v.id("runs")),
    dataBlobId: v.optional(v.string()),
    dataId: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("shared"), v.literal("private"))),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_source", ["userId", "source"])
    .index("by_user_and_key", ["userId", "key"]),

  userCredits: defineTable({
    userId: v.string(),
    balanceCents: v.number(),
    currency: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  usageEvents: defineTable({
    userId: v.string(),
    eventType: v.string(),
    creditsDeltaCents: v.number(),
    balanceAfterCents: v.number(),
    idempotencyKey: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created_at", ["userId", "createdAt"])
    .index("by_user_and_idempotency_key", ["userId", "idempotencyKey"]),

  wandbRuns: defineTable({
    runId: v.id("runs"),
    wandbRunId: v.string(),
    entity: v.optional(v.string()),
    project: v.optional(v.string()),
    displayName: v.optional(v.string()),
    state: v.optional(v.string()),
    config: v.optional(v.any()),
    configYaml: v.optional(v.string()),
    metadata: v.optional(v.any()),
    requirementsTxt: v.optional(v.string()),
    summary: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_wandb_run", ["runId", "wandbRunId"]),

  wandbMetrics: defineTable({
    runId: v.id("runs"),
    wandbRunId: v.string(),
    timestamp: v.number(),
    step: v.optional(v.number()),
    key: v.string(),
    value: v.number(),
    source: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_wandb_run", ["runId", "wandbRunId"]),

  runEvents: defineTable({
    runId: v.id("runs"),
    status: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_run", ["runId"]),

  runRuntimeLogs: defineTable({
    runId: v.id("runs"),
    timestamp: v.number(),
    level: v.string(),
    source: v.string(),
    message: v.string(),
  }).index("by_run", ["runId"]),

  runRuntimeMetrics: defineTable({
    runId: v.id("runs"),
    timestamp: v.number(),
    name: v.string(),
    value: v.number(),
    step: v.optional(v.number()),
    unit: v.optional(v.string()),
    source: v.string(),
  }).index("by_run", ["runId"]),

  shareLinks: defineTable({
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
    token: v.string(),
    permission: v.union(v.literal("read"), v.literal("edit")),
    createdByUserId: v.string(),
  })
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_token", ["token"])
    .index("by_creator", ["createdByUserId"]),

  dataBlobs: defineTable({
    userId: v.string(),
    blobId: v.string(),
    filename: v.string(),
    key: v.string(),
    size: v.number(),
    createdAt: v.optional(v.number()),
    contentType: v.optional(v.string()),
    path: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_key", ["key"]),
});
