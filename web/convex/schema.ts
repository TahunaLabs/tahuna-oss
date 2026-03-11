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
    .index("by_user_and_name", ["userId", "name"])
    .index("by_hash", ["keyHash"])
    .index("by_user_and_machine", ["userId", "machineId"]),

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
  }).index("by_user", ["userId"]),

  runs: defineTable({
    userId: v.string(),
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    dataId: v.optional(v.string()),
    input: v.string(),
    output: v.string(),
    logs: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    podId: v.optional(v.string()),
    effectiveGpuType: v.optional(v.string()),
    effectiveGpuCount: v.optional(v.number()),
    effectiveVolumeGb: v.optional(v.number()),
    codeManifestHash: v.optional(v.string()),
    dataManifestHash: v.optional(v.string()),
    runtimeTokenHash: v.optional(v.string()),
    artifactKeys: v.optional(v.array(v.string())),
    cancellationRequested: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_environment", ["userId", "environmentId"])
    .index("by_environment", ["environmentId"]),

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
  })
    .index("by_run", ["runId"])
    .index("by_run_and_timestamp", ["runId", "timestamp"]),

  runRuntimeMetrics: defineTable({
    runId: v.id("runs"),
    timestamp: v.number(),
    name: v.string(),
    value: v.number(),
    step: v.optional(v.number()),
    unit: v.optional(v.string()),
    source: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_run_and_timestamp", ["runId", "timestamp"]),
});
