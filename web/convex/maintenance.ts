import { ConvexError, v } from "convex/values";
import { ListObjectsV2Command, DeleteObjectsCommand, type ListObjectsV2CommandOutput, type _Object } from "@aws-sdk/client-s3";
import { R2 } from "@convex-dev/r2";
import type { Id } from "@convex/_generated/dataModel";
import { components, internal } from "@convex/_generated/api";
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "@convex/_generated/server";

const r2 = new R2(components.r2);
const CONFIRMATION_PHRASE = "DELETE_ALL_CONVEX_DATA";
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

const CLEANUP_TABLES = [
  "apiKeys",
  "dataBlobs",
  "environments",
  "runEvents",
  "runRuntimeLogs",
  "runRuntimeMetrics",
  "runs",
  "shares",
  "storageObjects",
  "wandbMetrics",
  "wandbRuns",
] as const;

type CleanupTable = (typeof CLEANUP_TABLES)[number];

type CleanupDocId =
  | Id<"apiKeys">
  | Id<"dataBlobs">
  | Id<"environments">
  | Id<"runEvents">
  | Id<"runRuntimeLogs">
  | Id<"runRuntimeMetrics">
  | Id<"runs">
  | Id<"shares">
  | Id<"storageObjects">
  | Id<"wandbMetrics">
  | Id<"wandbRuns">;

type CleanupTableBatchResult = {
  deleted: number;
  has_more: boolean;
};

type CountTableBatchResult = {
  count: number;
  has_more: boolean;
  next_cursor: string | null;
};

const cleanupTableValidator = v.union(
  v.literal("apiKeys"),
  v.literal("dataBlobs"),
  v.literal("environments"),
  v.literal("runEvents"),
  v.literal("runRuntimeLogs"),
  v.literal("runRuntimeMetrics"),
  v.literal("runs"),
  v.literal("shares"),
  v.literal("storageObjects"),
  v.literal("wandbMetrics"),
  v.literal("wandbRuns"),
);

const tableResultValidator = v.object({
  table: cleanupTableValidator,
  deleted: v.number(),
});

function normalizeBatchSize(raw: number | undefined) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_BATCH_SIZE;
  }
  const normalized = Math.floor(raw);
  if (normalized < 1) {
    return 1;
  }
  if (normalized > MAX_BATCH_SIZE) {
    return MAX_BATCH_SIZE;
  }
  return normalized;
}

async function cleanupR2(_ctx: ActionCtx, dryRun: boolean) {
  let deletedCount = 0;
  let continuationToken: string | undefined = undefined;

  while (true) {
    const listResponse: ListObjectsV2CommandOutput = await r2.client.send(
      new ListObjectsV2Command({
        Bucket: r2.config.bucket,
        ContinuationToken: continuationToken,
      }),
    );

    const objects: _Object[] = listResponse.Contents || [];
    if (objects.length === 0) break;

    if (!dryRun) {
      await r2.client.send(
        new DeleteObjectsCommand({
          Bucket: r2.config.bucket,
          Delete: {
            Objects: objects.map((obj: _Object) => ({ Key: obj.Key })),
          },
        }),
      );
    }

    deletedCount += objects.length;
    if (!listResponse.IsTruncated) break;
    continuationToken = listResponse.NextContinuationToken;
  }

  return deletedCount;
}

async function loadTableBatchIds(ctx: MutationCtx, table: CleanupTable, batchSize: number): Promise<CleanupDocId[]> {
  if (table === "apiKeys") {
    return (await ctx.db.query("apiKeys").take(batchSize)).map((row) => row._id);
  }
  if (table === "dataBlobs") {
    return (await ctx.db.query("dataBlobs").take(batchSize)).map((row) => row._id);
  }
  if (table === "environments") {
    return (await ctx.db.query("environments").take(batchSize)).map((row) => row._id);
  }
  if (table === "runEvents") {
    return (await ctx.db.query("runEvents").take(batchSize)).map((row) => row._id);
  }
  if (table === "runRuntimeLogs") {
    return (await ctx.db.query("runRuntimeLogs").take(batchSize)).map((row) => row._id);
  }
  if (table === "runRuntimeMetrics") {
    return (await ctx.db.query("runRuntimeMetrics").take(batchSize)).map((row) => row._id);
  }
  if (table === "runs") {
    return (await ctx.db.query("runs").take(batchSize)).map((row) => row._id);
  }
  if (table === "shares") {
    return (await ctx.db.query("shares").take(batchSize)).map((row) => row._id);
  }
  if (table === "storageObjects") {
    return (await ctx.db.query("storageObjects").take(batchSize)).map((row) => row._id);
  }
  if (table === "wandbMetrics") {
    return (await ctx.db.query("wandbMetrics").take(batchSize)).map((row) => row._id);
  }
  return (await ctx.db.query("wandbRuns").take(batchSize)).map((row) => row._id);
}

async function deleteTableIds(ctx: MutationCtx, table: CleanupTable, ids: CleanupDocId[]) {
  if (table === "apiKeys") {
    await Promise.all(ids.map((id) => ctx.db.delete("apiKeys", id as Id<"apiKeys">)));
    return;
  }
  if (table === "dataBlobs") {
    await Promise.all(ids.map((id) => ctx.db.delete("dataBlobs", id as Id<"dataBlobs">)));
    return;
  }
  if (table === "environments") {
    await Promise.all(ids.map((id) => ctx.db.delete("environments", id as Id<"environments">)));
    return;
  }
  if (table === "runEvents") {
    await Promise.all(ids.map((id) => ctx.db.delete("runEvents", id as Id<"runEvents">)));
    return;
  }
  if (table === "runRuntimeLogs") {
    await Promise.all(ids.map((id) => ctx.db.delete("runRuntimeLogs", id as Id<"runRuntimeLogs">)));
    return;
  }
  if (table === "runRuntimeMetrics") {
    await Promise.all(ids.map((id) => ctx.db.delete("runRuntimeMetrics", id as Id<"runRuntimeMetrics">)));
    return;
  }
  if (table === "runs") {
    await Promise.all(ids.map((id) => ctx.db.delete("runs", id as Id<"runs">)));
    return;
  }
  if (table === "shares") {
    await Promise.all(ids.map((id) => ctx.db.delete("shares", id as Id<"shares">)));
    return;
  }
  if (table === "storageObjects") {
    await Promise.all(ids.map((id) => ctx.db.delete("storageObjects", id as Id<"storageObjects">)));
    return;
  }
  if (table === "wandbMetrics") {
    await Promise.all(ids.map((id) => ctx.db.delete("wandbMetrics", id as Id<"wandbMetrics">)));
    return;
  }
  await Promise.all(ids.map((id) => ctx.db.delete("wandbRuns", id as Id<"wandbRuns">)));
}

export const internalCleanupTableBatch = internalMutation({
  args: {
    table: cleanupTableValidator,
    batch_size: v.number(),
    dry_run: v.boolean(),
  },
  returns: v.object({
    deleted: v.number(),
    has_more: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ids = await loadTableBatchIds(ctx, args.table, normalizeBatchSize(args.batch_size));
    if (!args.dry_run && ids.length > 0) {
      await deleteTableIds(ctx, args.table, ids);
    }
    return {
      deleted: ids.length,
      has_more: ids.length === normalizeBatchSize(args.batch_size),
    };
  },
});

export const internalCountTable = internalMutation({
  args: {
    table: cleanupTableValidator,
    cursor: v.union(v.string(), v.null()),
    batch_size: v.number(),
  },
  returns: v.object({
    count: v.number(),
    has_more: v.boolean(),
    next_cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const batchSize = normalizeBatchSize(args.batch_size);
    if (args.table === "apiKeys") {
      const result = await ctx.db.query("apiKeys").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "dataBlobs") {
      const result = await ctx.db.query("dataBlobs").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "environments") {
      const result = await ctx.db.query("environments").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "runEvents") {
      const result = await ctx.db.query("runEvents").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "runRuntimeLogs") {
      const result = await ctx.db.query("runRuntimeLogs").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "runRuntimeMetrics") {
      const result = await ctx.db.query("runRuntimeMetrics").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "runs") {
      const result = await ctx.db.query("runs").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "shares") {
      const result = await ctx.db.query("shares").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "storageObjects") {
      const result = await ctx.db.query("storageObjects").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    if (args.table === "wandbMetrics") {
      const result = await ctx.db.query("wandbMetrics").paginate({ cursor: args.cursor, numItems: batchSize });
      return {
        count: result.page.length,
        has_more: !result.isDone,
        next_cursor: result.isDone ? null : result.continueCursor,
      };
    }
    const result = await ctx.db.query("wandbRuns").paginate({ cursor: args.cursor, numItems: batchSize });
    return {
      count: result.page.length,
      has_more: !result.isDone,
      next_cursor: result.isDone ? null : result.continueCursor,
    };
  },
});

export const cleanupDatabase = internalAction({
  args: {
    confirm: v.string(),
    batch_size: v.optional(v.number()),
    dry_run: v.optional(v.boolean()),
  },
  returns: v.object({
    dry_run: v.boolean(),
    table_results: v.array(tableResultValidator),
    total_deleted: v.number(),
    r2_deleted: v.number(),
  }),
  handler: async (ctx, args) => {
    const confirmValue = args.confirm.trim();
    if (confirmValue !== CONFIRMATION_PHRASE) {
      throw new ConvexError(`confirmation phrase must be exactly ${CONFIRMATION_PHRASE}`);
    }

    const dryRun = args.dry_run === true;
    const batchSize = normalizeBatchSize(args.batch_size);

    const tableResults: Array<{ table: CleanupTable; deleted: number }> = [];
    let totalDeleted = 0;
    for (const table of CLEANUP_TABLES) {
      let tableDeleted = 0;
      if (dryRun) {
        let cursor: string | null = null;
        while (true) {
          const result = (await ctx.runMutation(internal.maintenance.internalCountTable, {
            table,
            cursor,
            batch_size: batchSize,
          })) as CountTableBatchResult;
          tableDeleted += result.count;
          if (!result.has_more) {
            break;
          }
          cursor = result.next_cursor;
        }
      } else {
        while (true) {
          const result = (await ctx.runMutation(internal.maintenance.internalCleanupTableBatch, {
            table,
            batch_size: batchSize,
            dry_run: false,
          })) as CleanupTableBatchResult;
          tableDeleted += result.deleted;
          if (!result.has_more) {
            break;
          }
        }
      }
      tableResults.push({ table, deleted: tableDeleted });
      totalDeleted += tableDeleted;
    }

    const r2Deleted = await cleanupR2(ctx, dryRun);

    return {
      dry_run: dryRun,
      table_results: tableResults,
      total_deleted: totalDeleted,
      r2_deleted: r2Deleted,
    };
  },
});
