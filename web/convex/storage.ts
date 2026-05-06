import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, type ActionCtx, type MutationCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { storageKeys } from "@convex/core/storage";
import { objectStore } from "@convex/objectStore";
import { parseManifest } from "@/convex/syncManifest";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const METADATA_LOOKUP_CONCURRENCY = 20;
const MAX_SEARCH_CHARS = 120;
const MAX_ARTIFACT_NAME_CHARS = 255;
const DELETE_BATCH_SIZE = 20;

const sortValidator = v.union(
  v.literal("created_desc"),
  v.literal("created_asc"),
  v.literal("name_asc"),
  v.literal("name_desc"),
  v.literal("size_desc"),
  v.literal("size_asc"),
);

const visibilityFilterValidator = v.union(v.literal("all"), v.literal("shared"), v.literal("private"));
const objectKindValidator = v.union(v.literal("data_upload"), v.literal("data_manifest"), v.literal("run_artifact"));
const resourceRefValidator = v.object({
  id: v.string(),
  name: v.string(),
});

const storageItemValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("data"), v.literal("run_artifact")),
  object_kind: objectKindValidator,
  visibility: v.union(v.literal("shared"), v.literal("private")),
  key: v.string(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  created_at: v.number(),
  download_url: v.string(),
  run: v.optional(resourceRefValidator),
  environment: v.optional(resourceRefValidator),
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
    shared: v.boolean(),
    private: v.boolean(),
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
  visibility: v.union(v.literal("shared"), v.literal("private")),
  object_kind: objectKindValidator,
  key: v.string(),
  name: v.string(),
  size: v.number(),
  created_at: v.number(),
  run: v.optional(resourceRefValidator),
  environment: v.optional(resourceRefValidator),
  data_blob_id: v.optional(v.string()),
});

const indexedStorageListValidator = v.object({
  objects: v.array(indexedStorageRowValidator),
});

type StorageItem = {
  id: string;
  source: "data" | "run_artifact";
  object_kind: "data_upload" | "data_manifest" | "run_artifact";
  visibility: "shared" | "private";
  key: string;
  name: string;
  path: string;
  size: number;
  created_at: number;
  download_url: string;
  run?: { id: string; name: string };
  environment?: { id: string; name: string };
  data_blob_id?: string;
};

type IndexedStorageRow = {
  id: string;
  source: "data" | "run_artifact";
  visibility: "shared" | "private";
  object_kind: "data_upload" | "data_manifest" | "run_artifact";
  key: string;
  name: string;
  size: number;
  created_at: number;
  run?: { id: string; name: string };
  environment?: { id: string; name: string };
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
  const haystack = [
    item.name,
    item.path,
    item.run?.id || "",
    item.run?.name || "",
    item.environment?.id || "",
    item.environment?.name || "",
    item.data_blob_id || "",
  ].join(" ").toLowerCase();
  return haystack.includes(search);
}

async function getAccessibleRun(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const run = await ctx.db.get("runs", runId);
  if (!run) {
    throw new ConvexError("run not found");
  }
  if (run.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return run;
}

function toStorageItem(row: IndexedStorageRow): StorageItem {
  return {
    id: `storage:${row.id}`,
    source: row.source,
    object_kind: row.object_kind,
    visibility: row.visibility,
    key: row.key,
    name: row.name,
    path: row.key,
    size: row.size,
    created_at: row.created_at,
    download_url: "",
    run: row.run,
    environment: row.environment,
    data_blob_id: row.data_blob_id,
  };
}

async function resolvePrimaryDataDownload(
  ctx: ActionCtx,
  item: StorageItem,
): Promise<Pick<StorageItem, "download_url" | "size"> | null> {
  try {
    const manifestUrl =
      (await objectStore.getMetadata(ctx, item.key))?.url ||
      (await objectStore.createSignedDownload(item.key)).url;
    const response = await fetch(manifestUrl, { method: "GET" });
    if (!response.ok) return null;
    const manifest = parseManifest(await response.json(), "data");
    const bundleEntry = manifest?.entries.find((entry) => entry.path === "__tahuna__/data_bundle.tar.gz");
    if (!bundleEntry) return null;
    return {
      download_url: (await objectStore.createSignedDownload(storageKeys.blobObjectKey(bundleEntry.sha256))).url,
      size: bundleEntry.size,
    };
  } catch {
    return null;
  }
}

function getContextFields(
  row: {
    runId?: Id<"runs">;
    objectKind: "data_upload" | "data_manifest" | "run_artifact";
    dataId?: string;
  },
  runsById: Map<string, { environmentId: Id<"environments">; name?: string }>,
  environmentById: Map<string, { _id: Id<"environments">; name: string }>,
  environmentByDataId: Map<string, { _id: Id<"environments">; name: string }>,
) {
  if (row.runId) {
    const runId = String(row.runId);
    const run = runsById.get(runId);
    const environmentId = run ? String(run.environmentId) : undefined;
    const environment = environmentId ? environmentById.get(environmentId) : undefined;
    return {
      run: {
        id: runId,
        name: run?.name?.trim() || `Run ${runId.slice(0, 8)}`,
      },
      environment: environment
        ? {
            id: String(environment._id),
            name: environment.name,
          }
        : undefined,
    };
  }
  if (row.objectKind !== "data_manifest" || !row.dataId) {
    return {};
  }
  const environment = environmentByDataId.get(row.dataId) || environmentById.get(row.dataId);
  if (!environment) {
    return {};
  }
  return {
    environment: {
      id: String(environment._id),
      name: environment.name,
    },
  };
}

async function hydrateDownloadUrls(ctx: ActionCtx, pageItems: StorageItem[]) {
  const out: StorageItem[] = [];
  for (let start = 0; start < pageItems.length; start += METADATA_LOOKUP_CONCURRENCY) {
    const chunk = pageItems.slice(start, start + METADATA_LOOKUP_CONCURRENCY);
    const rows = await Promise.all(
      chunk.map(async (item) => {
        if (item.object_kind === "data_manifest") {
          const resolved = await resolvePrimaryDataDownload(ctx, item);
          if (resolved) {
            return {
              ...item,
              size: resolved.size,
              download_url: resolved.download_url,
            };
          }
        }
        let metadata: null | { size?: number; lastModified?: string; url?: string } = null;
        try {
          metadata = await objectStore.getMetadata(ctx, item.key);
        } catch {
          metadata = null;
        }
        try {
          const downloadURL = metadata?.url || (await objectStore.createSignedDownload(item.key)).url;
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
    visibility: v.optional(v.union(v.literal("shared"), v.literal("private"))),
  },
  returns: indexedStorageListValidator,
  handler: async (ctx, args) => {
    const [allRows, runs, environments] = await Promise.all([
      ctx.db
      .query("storageObjects")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect(),
      ctx.db
        .query("runs")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
      ctx.db
        .query("environments")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect(),
    ]);
    const runsById = new Map<string, (typeof runs)[number]>(runs.map((run) => [String(run._id), run]));
    const environmentById = new Map<string, (typeof environments)[number]>(
      environments.map((environment) => [String(environment._id), environment]),
    );
    const environmentByDataId = new Map<string, (typeof environments)[number]>(
      environments.map((environment) => [environment.dataId, environment]),
    );
    const rows =
      args.visibility === "shared"
        ? allRows.filter((r) => r.visibility === "shared")
        : args.visibility === "private"
          ? allRows.filter((r) => r.visibility !== "shared")
          : allRows;

    return {
      objects: rows.map((row) => ({
        ...getContextFields(row, runsById, environmentById, environmentByDataId),
        id: String(row._id),
        source: row.source,
        visibility: row.visibility ?? "private",
        object_kind: row.objectKind,
        key: row.key,
        name: row.name || toObjectName(row.key),
        size: row.size || 0,
        created_at: row.createdAt || 0,
        data_blob_id: row.dataBlobId || undefined,
      })),
    };
  },
});

export const deleteMany = mutation({
  args: {
    keys: v.array(v.string()),
  },
  returns: v.object({
    deleted: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const keys = Array.from(
      new Set(args.keys.map((key) => key.trim()).filter((key) => key.length > 0)),
    );
    if (keys.length === 0) {
      return { deleted: 0 };
    }

    const rows = (
      await Promise.all(
        keys.map((key) =>
          ctx.db
            .query("storageObjects")
            .withIndex("by_user_and_key", (q) => q.eq("userId", userId).eq("key", key))
            .first(),
        ),
      )
    ).filter((row): row is NonNullable<typeof row> => row !== null);

    for (let start = 0; start < rows.length; start += DELETE_BATCH_SIZE) {
      const chunk = rows.slice(start, start + DELETE_BATCH_SIZE);
      await Promise.all(
        chunk.map(async (row) => {
          try {
            await objectStore.deleteObject(ctx, row.key);
          } catch {
            // Best-effort cleanup to avoid leaving stale index rows.
          }
        }),
      );
    }

    for (const row of rows) {
      if (row.runId) {
        const run = await ctx.db.get("runs", row.runId);
        if (run && run.userId === userId) {
          await ctx.db.patch("runs", row.runId, {
            artifactKeys: (run.artifactKeys || []).filter((key) => key !== row.key),
          });
          await ctx.db.insert("runEvents", {
            runId: row.runId,
            status: run.status,
            message: "artifact deleted",
            metadata: {
              key: row.key,
            },
          });
        }
      }

      if (row.objectKind === "data_upload") {
        const dataBlob = await ctx.db
          .query("dataBlobs")
          .withIndex("by_key", (q) => q.eq("key", row.key))
          .first();
        if (dataBlob && dataBlob.userId === userId) {
          await ctx.db.delete("dataBlobs", dataBlob._id);
        }
      }

      await ctx.db.delete("storageObjects", row._id);
    }

    return { deleted: rows.length };
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
    const run = await getAccessibleRun(ctx, args.userId, args.runId);
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

    const [sourceMetadata, targetMetadata] = await Promise.all([
      objectStore.getMetadata(ctx, fromKey),
      objectStore.getMetadata(ctx, toKey),
    ]);
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
    const run = await getAccessibleRun(ctx, args.userId, args.runId);
    const artifactKeys = run.artifactKeys || [];
    const ownerUserId = run.userId;

    if (!artifactKeys.includes(args.fromKey)) {
      throw new ConvexError("artifact rename conflict detected; refresh and retry");
    }
    if (artifactKeys.includes(args.toKey)) {
      throw new ConvexError("artifact name is already used by this run");
    }

    const fromRow = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", ownerUserId).eq("key", args.fromKey))
      .first();
    const toRow = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", ownerUserId).eq("key", args.toKey))
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
        userId: ownerUserId,
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

    await objectStore.copyObject(ctx, {
      fromKey: renamePlan.fromKey,
      toKey: renamePlan.toKey,
    });

    await objectStore.syncMetadata(ctx, renamePlan.toKey);
    const metadata = await objectStore.getMetadata(ctx, renamePlan.toKey);
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
        await objectStore.deleteObject(ctx, renamePlan.toKey);
      } catch {
        // Ignore rollback cleanup failures and surface the original conflict/error.
      }
      throw error;
    }

    let cleanupWarning = false;
    try {
      await objectStore.deleteObject(ctx, renamePlan.fromKey);
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
    visibility: v.optional(visibilityFilterValidator),
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

    const visibility = args.visibility ?? "all";
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
      visibility: visibility === "all" ? undefined : visibility,
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
        shared: false,
        private: false,
      },
    };
  },
});

export const setVisibility = mutation({
  args: {
    key: v.string(),
    visibility: v.union(v.literal("shared"), v.literal("private")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const obj = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", userId).eq("key", args.key))
      .first();
    if (!obj) {
      throw new ConvexError("storage object not found");
    }
    await ctx.db.patch(obj._id, { visibility: args.visibility });
    return null;
  },
});
