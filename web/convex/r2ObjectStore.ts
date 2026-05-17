import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type ListObjectsV2CommandOutput,
  type _Object,
} from "@aws-sdk/client-s3";
import { components } from "@convex/_generated/api";
import { SYNC_CONFIG } from "@convex/appConfig";
import { sleepMs } from "@convex/sleep";
import { R2, type R2Callbacks } from "@convex-dev/r2";
import type {
  ObjectMetadata,
  ObjectMetadataPage,
  ObjectMetadataSyncOptions,
  ObjectStore,
  ObjectStoreContext,
} from "@convex/core/storage";
import type { GenericActionCtx, GenericDataModel, GenericMutationCtx, GenericQueryCtx } from "convex/server";

const r2 = new R2(components.r2);

type ObjectStoreQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

type ObjectStoreMutationCtx = ObjectStoreQueryCtx & {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

type ObjectStoreActionCtx = ObjectStoreMutationCtx & {
  runAction: GenericActionCtx<GenericDataModel>["runAction"];
};

export type ObjectStoreClientApiOptions<DataModel extends GenericDataModel> = {
  checkReadKey?: (ctx: GenericQueryCtx<DataModel>, bucket: string, key: string) => void | Promise<void>;
  checkReadBucket?: (ctx: GenericQueryCtx<DataModel>, bucket: string) => void | Promise<void>;
  checkUpload?: (ctx: GenericQueryCtx<DataModel>, bucket: string) => void | Promise<void>;
  checkDelete?: (ctx: GenericQueryCtx<DataModel>, bucket: string, key: string) => void | Promise<void>;
  onUpload?: (ctx: GenericMutationCtx<DataModel>, bucket: string, key: string) => void | Promise<void>;
  onSyncMetadata?: (
    ctx: GenericMutationCtx<DataModel>,
    args: { bucket: string; key: string; isNew: boolean },
  ) => void | Promise<void>;
  onDelete?: (ctx: GenericMutationCtx<DataModel>, bucket: string, key: string) => void | Promise<void>;
  callbacks?: R2Callbacks;
};

function asQueryCtx(ctx: ObjectStoreContext) {
  return ctx as ObjectStoreQueryCtx;
}

function asMutationCtx(ctx: ObjectStoreContext) {
  return ctx as ObjectStoreMutationCtx;
}

function asActionCtx(ctx: ObjectStoreContext) {
  return ctx as ObjectStoreActionCtx;
}

function isObjectNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const row = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return row.name === "NotFound" || row.Code === "NotFound" || row.$metadata?.httpStatusCode === 404;
}

function normalizeMetadata(key: string, metadata: unknown): ObjectMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const row = metadata as {
    key?: string;
    url?: string;
    size?: number;
    sha256?: string;
    _providerCreationTime?: string;
    contentType?: string;
  };
  return {
    key: row.key || key,
    url: row.url,
    size: row.size,
    sha256: row.sha256,
    _providerCreationTime: row._providerCreationTime,
    contentType: row.contentType,
  };
}

async function getSignedDownloadByHead(key: string) {
  try {
    await r2.client.send(
      new HeadObjectCommand({
        Bucket: r2.config.bucket,
        Key: key,
      }),
    );
    return { key, url: await r2.getUrl(key) };
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function syncOptions(options: ObjectMetadataSyncOptions | undefined) {
  return {
    attempts: options?.attempts ?? SYNC_CONFIG.objectMetadataPollAttempts,
    initialBackoffMs: options?.initialBackoffMs ?? SYNC_CONFIG.objectMetadataPollInitialBackoffMs,
    maxBackoffMs: options?.maxBackoffMs ?? SYNC_CONFIG.objectMetadataPollMaxBackoffMs,
  };
}

function buildCopySource(key: string) {
  return `${r2.config.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
}

export const r2ObjectStore: ObjectStore = {
  async createSignedUpload(key) {
    return await r2.generateUploadUrl(key);
  },

  async createSignedDownload(key) {
    return { key, url: await r2.getUrl(key) };
  },

  async getMetadata(ctx, key) {
    return normalizeMetadata(key, await r2.getMetadata(asQueryCtx(ctx), key));
  },

  async getSignedDownload(ctx, key) {
    const metadata = await this.getMetadata(ctx, key);
    if (metadata?.url) {
      return { key, url: metadata.url };
    }
    return await getSignedDownloadByHead(key);
  },

  async getSignedDownloadWithMetadataSync(ctx, key, options) {
    const immediate = await this.getSignedDownload(ctx, key);
    if (immediate) {
      return immediate;
    }

    const resolvedOptions = syncOptions(options);
    let delay = resolvedOptions.initialBackoffMs;
    for (let attempt = 0; attempt < resolvedOptions.attempts; attempt += 1) {
      const metadata = await this.getMetadata(ctx, key);
      if (metadata?.url) {
        return { key, url: metadata.url };
      }
      const signedDownload = await getSignedDownloadByHead(key);
      if (signedDownload) {
        return signedDownload;
      }
      if (attempt < resolvedOptions.attempts - 1) {
        await sleepMs(delay);
        if (delay < resolvedOptions.maxBackoffMs) {
          delay *= 2;
        }
      }
    }
    return null;
  },

  async objectExists(ctx, key, options) {
    const metadata = await this.getMetadata(ctx, key);
    if (metadata?.url) {
      return true;
    }

    const resolvedOptions = syncOptions(options);
    let delay = resolvedOptions.initialBackoffMs;
    for (let attempt = 0; attempt < resolvedOptions.attempts; attempt += 1) {
      try {
        if (await getSignedDownloadByHead(key)) {
          return true;
        }
      } catch {
        // Transient object-store errors are handled by the retry loop.
      }
      if (await this.getMetadata(ctx, key)) {
        return true;
      }
      if (attempt < resolvedOptions.attempts - 1) {
        await sleepMs(delay);
        if (delay < resolvedOptions.maxBackoffMs) {
          delay *= 2;
        }
      }
    }
    return false;
  },

  async readBytes(_ctx, key) {
    const download = await this.createSignedDownload(key);
    const response = await fetch(download.url);
    if (response.status === 404) {
      throw new Error(`object not found: ${key}`);
    }
    if (!response.ok) {
      throw new Error(`failed to fetch object ${key}: http ${response.status}`);
    }
    return await response.arrayBuffer();
  },

  async listMetadata(ctx, limit, cursor): Promise<ObjectMetadataPage> {
    const result = await r2.listMetadata(asQueryCtx(ctx), limit, cursor);
    return {
      page: result.page.map((item) => normalizeMetadata(item.key, item)).filter((item): item is ObjectMetadata => item !== null),
      isDone: result.isDone,
      continueCursor: result.continueCursor ?? null,
    };
  },

  async syncMetadata(ctx, key) {
    await r2.syncMetadata(asActionCtx(ctx), key);
  },

  async deleteObject(ctx, key) {
    await r2.deleteObject(asMutationCtx(ctx), key);
  },

  async copyObject(_ctx, args) {
    await r2.client.send(
      new CopyObjectCommand({
        Bucket: r2.config.bucket,
        CopySource: buildCopySource(args.fromKey),
        Key: args.toKey,
        MetadataDirective: "COPY",
      }),
    );
  },

  async putTextObject(_ctx, key, body, options) {
    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.config.bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
      }),
    );
  },

  async deleteAllObjects(_ctx, dryRun) {
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
  },
};

export function createObjectStoreClientApi<DataModel extends GenericDataModel>(
  options?: ObjectStoreClientApiOptions<DataModel>,
) {
  return r2.clientApi<DataModel>(options);
}
