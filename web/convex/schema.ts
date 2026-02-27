import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({

  apiKeys: defineTable({
    userId: v.string(),
    name: v.string(),
    keyPrefix: v.string(),
    keyHash: v.string(),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["keyHash"]),

  environments: defineTable({
    userId: v.string(),
    name: v.string(),
    artifacts: v.string(),
    gpuType: v.string(),
    gpuCount: v.number(),
    volumeGb: v.number(),
    framework: v.string(),
    version: v.string(),
  }).index("by_user", ["userId"]),

  runs: defineTable({
    userId: v.string(),
    environmentId: v.id("environments"),
    input: v.string(),
    output: v.string(),
    logs: v.string(),
    status: v.string(),
    error: v.optional(v.string()),
    podId: v.optional(v.string()),
    effectiveGpuType: v.optional(v.string()),
    effectiveGpuCount: v.optional(v.number()),
    effectiveVolumeGb: v.optional(v.number()),
    cancellationRequested: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_environment", ["environmentId"]),

  runEvents: defineTable({
    runId: v.id("runs"),
    status: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_run", ["runId"]),
});
