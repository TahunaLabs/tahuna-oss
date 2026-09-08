import type { ActionCtx } from "@convex/_generated/server";
import { images } from "@convex/catalog";
import { computeProvider } from "@convex/computeProvider";
import { sha256Hex } from "@convex/syncManifest";

export function resolveImageName(framework: string, version: string, pythonVersion: string) {
  const frameworkImages = images[framework];
  if (!frameworkImages) {
    throw new Error(`unsupported framework for provisioning: ${framework}`);
  }
  const versionImages = frameworkImages[version];
  if (!versionImages) {
    throw new Error(`unsupported framework version for provisioning: ${framework}:${version}`);
  }
  const imageName = versionImages[pythonVersion];
  if (!imageName) {
    throw new Error(`unsupported python version for provisioning: ${framework}:${version}:${pythonVersion}`);
  }
  return imageName;
}

export function resolveRuntimeApiBase() {
  // Dev: machine can't reach localhost — call Convex HTTP actions directly (CONVEX_SITE_URL is a Convex built-in)
  if (process.env.ENV === "development") {
    const convexSiteUrl = process.env.CONVEX_SITE_URL;
    if (!convexSiteUrl) throw new Error("CONVEX_SITE_URL is required in development");
    return convexSiteUrl;
  }
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL is required for machine runtime callbacks");
  return siteUrl;
}

export function resolveWandbBaseURL(runtimeApiBase: string) {
  return `${runtimeApiBase.replace(/\/+$/, "")}/api/monitoring/wandb`;
}

export function generateRuntimeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type CreateRuntimeMachineArgs = {
  ctx: ActionCtx;
  name: string;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  env: Record<string, string>;
  ports?: string[];
};

type ProvisionRuntimeMachineArgs = {
  ctx: ActionCtx;
  shouldAbort: () => Promise<boolean>;
  setRuntimeTokenHash: (runtimeTokenHash: string) => Promise<void>;
  createMachine: Omit<CreateRuntimeMachineArgs, "ctx" | "env">;
  buildEnv: (args: {
    runtimeToken: string;
    runtimeApiBase: string;
    runtimeRequestTimeoutSeconds: string;
  }) => Record<string, string>;
};

type TerminateRuntimeMachineWithRetryArgs = {
  ctx: ActionCtx;
  providerMachineId: string;
  attempt: number;
  shouldTerminate: () => Promise<boolean>;
  onTerminated: () => Promise<void>;
  onRetry: (args: {
    nextAttempt: number;
    error: string;
  }) => Promise<void>;
};

export async function createRuntimeMachine(args: CreateRuntimeMachineArgs) {
  return await computeProvider.createMachine(args.ctx, {
    name: args.name,
    imageName: args.imageName,
    gpuType: args.gpuType,
    gpuCount: args.gpuCount,
    volumeGb: args.volumeGb,
    env: args.env,
    ports: args.ports,
  });
}

export async function provisionRuntimeMachine(args: ProvisionRuntimeMachineArgs) {
  const runtimeToken = generateRuntimeToken();
  const runtimeTokenHash = await sha256Hex(runtimeToken);
  await args.setRuntimeTokenHash(runtimeTokenHash);
  if (await args.shouldAbort()) {
    return null;
  }

  const runtimeApiBase = resolveRuntimeApiBase();
  const runtimeRequestTimeoutSeconds = process.env.TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS?.trim() || "120";
  return await createRuntimeMachine({
    ctx: args.ctx,
    ...args.createMachine,
    env: args.buildEnv({
      runtimeToken,
      runtimeApiBase,
      runtimeRequestTimeoutSeconds,
    }),
  });
}

export async function terminateRuntimeMachine(
  ctx: ActionCtx,
  args: {
    providerMachineId: string;
  },
) {
  if (!args.providerMachineId) {
    return;
  }
  await computeProvider.terminateMachine(ctx, {
    providerMachineId: args.providerMachineId,
  });
}

export async function terminateRuntimeMachineWithRetry(args: TerminateRuntimeMachineWithRetryArgs) {
  const shouldTerminate = await args.shouldTerminate();
  if (!shouldTerminate) {
    return;
  }

  try {
    await terminateRuntimeMachine(args.ctx, {
      providerMachineId: args.providerMachineId,
    });
    await args.onTerminated();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "failed to terminate machine";
    const nextAttempt = args.attempt + 1;
    await args.onRetry({
      nextAttempt,
      error: detail,
    });
  }
}
