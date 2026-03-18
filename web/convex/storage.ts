import { R2 } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { components, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { action, internalMutation, internalQuery, type ActionCtx, type MutationCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";

const r2 = new R2(components.r2);

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const METADATA_LOOKUP_CONCURRENCY = 20;
const MAX_SEARCH_CHARS = 120;
const MAX_ARTIFACT_NAME_CHARS = 255;

const sortValidator = v.union(
  v.literal("created_desc"),
  v.literal("created_asc"),
  v.literal("name_asc"),
  v.literal("name_desc"),
  v.literal("size_desc"),
  v.literal("size_asc"),
);

const sourceFilterValidator = v.union(v.literal("all"), v.literal("data"), v.literal("run_artifact"));
const objectKindValidator = v.union(v.literal("data_upload"), v.literal("data_manifest"), v.literal("run_artifact"));

const storageItemValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("data"), v.literal("run_artifact")),
  key: v.string(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  created_at: v.number(),
  download_url: v.string(),
  run_id: v.optional(v.string()),
  data_blob_id: v.optional(v.string()),
});

const storageListValidator = v.object({
  items: v.array(storageItemValidator),
  total: v.number(),
  offset: v.number(),
  limit: v.number(),
  has_more: v.boolean(),
  next_offset: v.union(v.number(), v.null()),
  next_cursor: v.union(v.string(), v.null()),
  scan_capped: v.object({
    data: v.boolean(),
    run_artifact: v.boolean(),
  }),
});

const renameArtifactResultValidator = v.object({
  run_id: v.string(),
  key: v.string(),
  name: v.string(),
  path: v.string(),
  download_url: v.string(),
  cleanup_warning: v.boolean(),
});

const indexedStorageRowValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("data"), v.literal("run_artifact")),
  object_kind: objectKindValidator,
  key: v.string(),
  name: v.string(),
  size: v.number(),
  created_at: v.number(),
  run_id: v.optional(v.string()),
  data_blob_id: v.optional(v.string()),
});

const indexedStorageListValidator = v.object({
  objects: v.array(indexedStorageRowValidator),
});

type StorageItem = {
  id: string;
  source: "data" | "run_artifact";
  key: string;
  name: string;
  path: string;
  size: number;
  created_at: number;
  download_url: string;
  run_id?: string;
  data_blob_id?: string;
};

type IndexedStorageRow = {
  id: string;
  source: "data" | "run_artifact";
  object_kind: "data_upload" | "data_manifest" | "run_artifact";
  key: string;
  name: string;
  size: number;
  created_at: number;
  run_id?: string;
  data_blob_id?: string;
};

type StorageSort = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc";

function encodeOffsetCursor(offset: number) {
  return `offset:${offset}`;
}

function decodeOffsetCursor(cursor: string): number | null {
  const value = cursor.trim();
  if (!value.startsWith("offset:")) {
    return null;
  }
  const raw = Number(value.slice("offset:".length));
  if (!Number.isFinite(raw)) {
    return null;
  }
  return Math.max(0, Math.floor(raw));
}

function normalizeLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function normalizeOffset(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeArtifactName(value: string) {
  const name = value.trim();
  if (!name) {
    throw new ConvexError("artifact name is required");
  }
  if (name.length > MAX_ARTIFACT_NAME_CHARS) {
    throw new ConvexError(`artifact name must be ${MAX_ARTIFACT_NAME_CHARS} characters or fewer`);
  }
  if (name === "." || name === "..") {
    throw new ConvexError("artifact name is invalid");
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new ConvexError("artifact name must not include path separators");
  }
  if (/[\u0000-\u001f]/.test(name)) {
    throw new ConvexError("artifact name contains unsupported control characters");
  }
  return name;
}

function buildRenamedKey(currentKey: string, nextName: string) {
  const key = currentKey.trim();
  if (!key) {
    throw new ConvexError("artifact key is required");
  }
  const slashIndex = key.lastIndexOf("/");
  if (slashIndex < 0 || slashIndex >= key.length - 1) {
    throw new ConvexError("artifact key is invalid");
  }
  const currentName = key.slice(slashIndex + 1);
  const parentPrefix = key.slice(0, slashIndex + 1);
  return {
    currentName,
    fromKey: key,
    toKey: `${parentPrefix}${nextName}`,
  };
}

function toObjectName(key: string) {
  const leaf = key.split("/").pop();
  return (leaf && leaf.trim()) || key;
}

function toTimestamp(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : fallback;
}

function sortItems(items: StorageItem[], sort: StorageSort) {
  return items.sort((a, b) => {
    if (sort === "created_asc") {
      if (a.created_at !== b.created_at) return a.created_at - b.created_at;
      return a.key.localeCompare(b.key);
    }
    if (sort === "created_desc") {
      if (a.created_at !== b.created_at) return b.created_at - a.created_at;
      return a.key.localeCompare(b.key);
    }
    if (sort === "size_asc") {
      if (a.size !== b.size) return a.size - b.size;
      return a.key.localeCompare(b.key);
    }
    if (sort === "size_desc") {
      if (a.size !== b.size) return b.size - a.size;
      return a.key.localeCompare(b.key);
    }
    if (sort === "name_asc") {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return a.key.localeCompare(b.key);
    }
    const byName = b.name.localeCompare(a.name);
    if (byName !== 0) return byName;
    return a.key.localeCompare(b.key);
  });
}

function matchesSearch(item: StorageItem, search: string) {
  if (!search) return true;
  const haystack = [item.name, item.path, item.run_id || "", item.data_blob_id || ""].join(" ").toLowerCase();
  return haystack.includes(search);
}

async function getOwnedRun(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const run = await ctx.db.get("runs", runId);
  if (!run || run.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return run;
}

function toStorageItem(row: IndexedStorageRow): StorageItem {
  return {
    id: `storage:${row.id}`,
    source: row.source,
    key: row.key,
    name: row.name,
    path: row.key,
    size: row.size,
    created_at: row.created_at,
    download_url: "",
    run_id: row.run_id,
    data_blob_id: row.data_blob_id,
  };
}

async function hydrateDownloadUrls(ctx: ActionCtx, pageItems: StorageItem[]) {
  const out: StorageItem[] = [];
  for (let start = 0; start < pageItems.length; start += METADATA_LOOKUP_CONCURRENCY) {
    const chunk = pageItems.slice(start, start + METADATA_LOOKUP_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (item) => {
        let metadata: null | { size?: number; lastModified?: string; url?: string } = null;
        try {
          metadata = await r2.getMetadata(ctx, item.key);
        } catch {
          metadata = null;
        }
        try {
          const downloadURL = metadata?.url || (await r2.getUrl(item.key));
          return {
            ...item,
            size: typeof metadata?.size === "number" ? metadata.size : item.size,
            created_at: toTimestamp(metadata?.lastModified, item.created_at),
            download_url: downloadURL,
          };
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) {
      if (row) {
        out.push(row);
      }
    }
  }
  return out;
}

export const internalListIndexedObjects = internalQuery({
  args: {
    userId: v.string(),
    source: v.optional(v.union(v.literal("data"), v.literal("run_artifact"))),
  },
  returns: indexedStorageListValidator,
  handler: async (ctx, args) => {
    const rows =
      args.source === "data" || args.source === "run_artifact"
        ? await ctx.db
            .query("storageObjects")
            .withIndex("by_user_and_source", (q) => q.eq("userId", args.userId).eq("source", args.source!))
            .collect()
        : await ctx.db
            .query("storageObjects")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

    return {
      objects: rows.map((row) => ({
        id: String(row._id),
        source: row.source,
        object_kind: row.objectKind,
        key: row.key,
        name: row.name || toObjectName(row.key),
        size: row.size || 0,
        created_at: row.createdAt || 0,
        run_id: row.runId ? String(row.runId) : undefined,
        data_blob_id: row.dataBlobId || undefined,
      })),
    };
  },
});

export const internalPrepareArtifactRename = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id("runs"),
    key: v.string(),
    name: v.string(),
  },
  returns: v.object({
    runId: v.id("runs"),
    fromKey: v.string(),
    toKey: v.string(),
    name: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await getOwnedRun(ctx, args.userId, args.runId);
    const name = normalizeArtifactName(args.name);
    const { currentName, fromKey, toKey } = buildRenamedKey(args.key, name);

    if (currentName === name) {
      throw new ConvexError("new artifact name must differ from the current name");
    }
    const artifactKeys = run.artifactKeys || [];
    if (!artifactKeys.includes(fromKey)) {
      throw new ConvexError("artifact not found in run outputs");
    }
    if (artifactKeys.includes(toKey)) {
      throw new ConvexError("artifact name already exists in this run");
    }

    const [sourceMetadata, targetMetadata] = await Promise.all([r2.getMetadata(ctx, fromKey), r2.getMetadata(ctx, toKey)]);
    if (!sourceMetadata?.url) {
      throw new ConvexError("artifact object is missing from storage");
    }
    if (targetMetadata?.url) {
      throw new ConvexError("artifact name already exists in storage");
    }

    return {
      runId: args.runId,
      fromKey,
      toKey,
      name,
    };
  },
});

export const internalFinalizeArtifactRename = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id("runs"),
    fromKey: v.string(),
    toKey: v.string(),
    size: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getOwnedRun(ctx, args.userId, args.runId);
    const artifactKeys = run.artifactKeys || [];

    if (!artifactKeys.includes(args.fromKey)) {
      throw new ConvexError("artifact rename conflict detected; refresh and retry");
    }
    if (artifactKeys.includes(args.toKey)) {
      throw new ConvexError("artifact name is already used by this run");
    }

    const fromRow = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", args.userId).eq("key", args.fromKey))
      .first();
    const toRow = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", args.userId).eq("key", args.toKey))
      .first();
    if (toRow && (!fromRow || toRow._id !== fromRow._id)) {
      throw new ConvexError("artifact name is already indexed");
    }

    await ctx.db.patch("runs", args.runId, {
      artifactKeys: artifactKeys.map((key) => (key === args.fromKey ? args.toKey : key)),
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: run.status,
      message: "artifact renamed",
      metadata: {
        from_key: args.fromKey,
        to_key: args.toKey,
      },
    });

    const createdAt =
      typeof args.createdAt === "number" && Number.isFinite(args.createdAt) && args.createdAt > 0
        ? Math.floor(args.createdAt)
        : (fromRow?.createdAt || Date.now());
    const size =
      typeof args.size === "number" && Number.isFinite(args.size) && args.size >= 0
        ? Math.floor(args.size)
        : (fromRow?.size || 0);
    const patch = {
      source: "run_artifact" as const,
      objectKind: "run_artifact" as const,
      key: args.toKey,
      name: toObjectName(args.toKey),
      size,
      createdAt,
      runId: args.runId,
      dataBlobId: undefined,
      dataId: undefined,
    };
    if (fromRow) {
      await ctx.db.patch("storageObjects", fromRow._id, patch);
    } else {
      await ctx.db.insert("storageObjects", {
        userId: args.userId,
        ...patch,
      });
    }
    return null;
  },
});

export const renameArtifact = action({
  args: {
    runId: v.id("runs"),
    key: v.string(),
    name: v.string(),
  },
  returns: renameArtifactResultValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);

    const renamePlan = (await ctx.runMutation(internal.storage.internalPrepareArtifactRename, {
      userId,
      runId: args.runId,
      key: args.key,
      name: args.name,
    })) as {
      runId: Id<"runs">;
      fromKey: string;
      toKey: string;
      name: string;
    };

    const copySource = `${r2.config.bucket}/${encodeURIComponent(renamePlan.fromKey).replace(/%2F/g, "/")}`;
    await r2.client.send(
      new CopyObjectCommand({
        Bucket: r2.config.bucket,
        CopySource: copySource,
        Key: renamePlan.toKey,
        MetadataDirective: "COPY",
      }),
    );

    await r2.syncMetadata(ctx, renamePlan.toKey);
    const metadata = await r2.getMetadata(ctx, renamePlan.toKey);
    if (!metadata?.url) {
      throw new ConvexError("renamed artifact metadata could not be loaded");
    }

    try {
      await ctx.runMutation(internal.storage.internalFinalizeArtifactRename, {
        userId,
        runId: renamePlan.runId,
        fromKey: renamePlan.fromKey,
        toKey: renamePlan.toKey,
        size: typeof metadata.size === "number" && Number.isFinite(metadata.size) ? metadata.size : 0,
        createdAt: toTimestamp(metadata.lastModified, Date.now()),
      });
    } catch (error) {
      try {
        await r2.deleteObject(ctx, renamePlan.toKey);
      } catch {
        // Ignore rollback cleanup failures and surface the original conflict/error.
      }
      throw error;
    }

    let cleanupWarning = false;
    try {
      await r2.deleteObject(ctx, renamePlan.fromKey);
    } catch {
      cleanupWarning = true;
    }

    return {
      run_id: String(renamePlan.runId),
      key: renamePlan.toKey,
      name: renamePlan.name,
      path: renamePlan.toKey,
      download_url: metadata.url,
      cleanup_warning: cleanupWarning,
    };
  },
});

export const list = action({
  args: {
    source: v.optional(sourceFilterValidator),
    search: v.optional(v.string()),
    sort: v.optional(sortValidator),
    cursor: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: storageListValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);

    const source = args.source ?? "all";
    const sort: StorageSort = args.sort ?? "created_desc";
    const search = (args.search || "").trim().slice(0, MAX_SEARCH_CHARS).toLowerCase();
    const limit = normalizeLimit(args.limit);
    const cursorOffset = typeof args.cursor === "string" ? decodeOffsetCursor(args.cursor) : null;
    if (typeof args.cursor === "string" && cursorOffset === null) {
      throw new ConvexError("invalid storage cursor");
    }
    const offset = cursorOffset ?? normalizeOffset(args.offset);

    const indexed = (await ctx.runQuery(internal.storage.internalListIndexedObjects, {
      userId,
      source: source === "all" ? undefined : source,
    })) as { objects: IndexedStorageRow[] };

    const baseItems = indexed.objects.map(toStorageItem);
    const filtered = baseItems.filter((item) => matchesSearch(item, search));
    const combined = sortItems(filtered, sort);
    const total = combined.length;
    const pageItems = combined.slice(offset, offset + limit);
    const items = await hydrateDownloadUrls(ctx, pageItems);
    const hasMore = offset + limit < total;

    return {
      items,
      total,
      offset,
      limit,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
      next_cursor: hasMore ? encodeOffsetCursor(offset + limit) : null,
      scan_capped: {
        data: false,
        run_artifact: false,
      },
    };
  },
});
