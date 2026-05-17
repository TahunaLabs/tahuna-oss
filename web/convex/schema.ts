import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { cloudRunBillingFields, cloudSchemaTables } from "@convex/cloud/schema";

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
    dataId: v.string(),
    deletionScheduledAt: v.optional(v.number()),
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
    trainDependencyGroup: v.optional(v.string()),
    outputDir: v.string(),
    serveSnapshot: v.optional(v.object({
      command: v.array(v.string()),
      dependencyGroup: v.optional(v.string()),
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
    dataId: v.string(),
    outputDir: v.optional(v.string()),
    input: v.string(),
    output: v.string(),
    logs: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    providerMachineId: v.optional(v.string()),
    effectiveGpuType: v.optional(v.string()),
    effectiveGpuCount: v.optional(v.number()),
    effectiveVolumeGb: v.optional(v.number()),
    codeManifestHash: v.optional(v.string()),
    dataManifestHash: v.optional(v.string()),
    dependencyGroup: v.optional(v.string()),
    runtimeTokenHash: v.optional(v.string()),
    artifactKeys: v.optional(v.array(v.string())),
    cancellationRequested: v.boolean(),
    providerCreationTime: v.optional(v.number()),
    computeStartedAt: v.optional(v.number()),
    computeEndedAt: v.optional(v.number()),
    ...cloudRunBillingFields,
  })
    .index("by_user", ["userId"])
    .index("by_user_and_environment", ["userId", "environmentId"])
    .index("by_status", ["status"])
    .index("by_runtime_token_hash", ["runtimeTokenHash"]),

  jobs: defineTable({
    type: v.union(
      v.literal("provision_run"),
      v.literal("check_startup_timeout"),
      v.literal("terminate_machine"),
      v.literal("finalize_artifact"),
      v.literal("cleanup_failed_upload"),
      v.literal("provision_serve"),
      v.literal("check_serve_startup_timeout"),
      v.literal("terminate_serve_machine"),
      v.literal("delete_serve_data"),
    ),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    payload: v.any(),
    delayMs: v.number(),
    availableAt: v.number(),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status_and_available_at", ["status", "availableAt"]),

  serves: defineTable({
    userId: v.string(),
    environmentId: v.id("environments"),
    command: v.array(v.string()),
    outputDir: v.string(),
    logs: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    providerMachineId: v.optional(v.string()),
    runtimeTokenHash: v.optional(v.string()),
    computeStartedAt: v.optional(v.number()),
    computeEndedAt: v.optional(v.number()),
    codeManifestHash: v.optional(v.string()),
    dataManifestHash: v.optional(v.string()),
    dependencyGroup: v.optional(v.string()),
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
    modelSnapshot: v.object({
      sourceType: v.union(v.literal("run"), v.literal("storage")),
      sourceRunId: v.optional(v.id("runs")),
      sourceObjectPrefix: v.optional(v.string()),
      sourceModelPath: v.optional(v.string()),
      objectPrefix: v.string(),
      manifestKey: v.string(),
      manifestHash: v.string(),
      objectCount: v.number(),
      totalBytes: v.number(),
    }),
    ...cloudRunBillingFields,
  })
    .index("by_user", ["userId"])
    .index("by_user_and_environment", ["userId", "environmentId"])
    .index("by_status", ["status"])
    .index("by_runtime_token_hash", ["runtimeTokenHash"]),

  envVars: defineTable({
    environmentId: v.id("environments"),
    name: v.string(),
    valueCiphertext: v.string(),
    valueIv: v.string(),
    valueVersion: v.number(),
    updatedAt: v.number(),
  })
    .index("by_environment", ["environmentId"])
    .index("by_environment_and_name", ["environmentId", "name"]),

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
    lastProviderMachineId: v.optional(v.string()),
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
    lastModifiedAt: v.number(),
    runId: v.optional(v.id("runs")),
    dataBlobId: v.optional(v.string()),
    dataId: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("shared"), v.literal("private"))),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_source", ["userId", "source"])
    .index("by_user_and_key", ["userId", "key"]),

  ...cloudSchemaTables,

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

  serveEvents: defineTable({
    serveId: v.id("serves"),
    status: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_serve", ["serveId"]),

  serveRuntimeLogs: defineTable({
    serveId: v.id("serves"),
    timestamp: v.number(),
    level: v.string(),
    source: v.string(),
    message: v.string(),
  }).index("by_serve", ["serveId"]),

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
    lastModifiedAt: v.optional(v.number()),
    contentType: v.optional(v.string()),
    path: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_key", ["key"]),
});
