/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as appConfig from "../appConfig.js";
import type * as auth from "../auth.js";
import type * as catalog from "../catalog.js";
import type * as cli_data from "../cli/data.js";
import type * as cli_envVars from "../cli/envVars.js";
import type * as cli_environments from "../cli/environments.js";
import type * as cli_runs from "../cli/runs.js";
import type * as cli_serves from "../cli/serves.js";
import type * as cli_shared from "../cli/shared.js";
import type * as cli_sync from "../cli/sync.js";
import type * as cli_system from "../cli/system.js";
import type * as cloud_authConfig from "../cloud/authConfig.js";
import type * as cloud_billing from "../cloud/billing.js";
import type * as cloud_credits from "../cloud/credits.js";
import type * as cloud_errors from "../cloud/errors.js";
import type * as cloud_resend from "../cloud/resend.js";
import type * as cloud_runBilling from "../cloud/runBilling.js";
import type * as cloud_runLifecycleComposition from "../cloud/runLifecycleComposition.js";
import type * as cloud_runpodComputeComposition from "../cloud/runpodComputeComposition.js";
import type * as cloud_serveBilling from "../cloud/serveBilling.js";
import type * as cloud_serveLifecycleComposition from "../cloud/serveLifecycleComposition.js";
import type * as computeProvider from "../computeProvider.js";
import type * as computeSessionAssignment from "../computeSessionAssignment.js";
import type * as computeSessions from "../computeSessions.js";
import type * as computeSessionsRead from "../computeSessionsRead.js";
import type * as convexJobQueue from "../convexJobQueue.js";
import type * as core_compute from "../core/compute.js";
import type * as core_computeSessionLifecyclePlan from "../core/computeSessionLifecyclePlan.js";
import type * as core_jobQueue from "../core/jobQueue.js";
import type * as core_runLifecyclePlan from "../core/runLifecyclePlan.js";
import type * as core_runTiming from "../core/runTiming.js";
import type * as core_serveLifecyclePlan from "../core/serveLifecyclePlan.js";
import type * as core_storage from "../core/storage.js";
import type * as credentialsCrypto from "../credentialsCrypto.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as data from "../data.js";
import type * as envVars from "../envVars.js";
import type * as environments from "../environments.js";
import type * as http from "../http.js";
import type * as ids from "../ids.js";
import type * as maintenance from "../maintenance.js";
import type * as monitoring_wandb from "../monitoring/wandb.js";
import type * as objectStore from "../objectStore.js";
import type * as r2ObjectStore from "../r2ObjectStore.js";
import type * as resend from "../resend.js";
import type * as runpodComputeProvider from "../runpodComputeProvider.js";
import type * as runpodCredentialSecrets from "../runpodCredentialSecrets.js";
import type * as runs from "../runs.js";
import type * as runsAccess from "../runsAccess.js";
import type * as runsConstants from "../runsConstants.js";
import type * as runsHttp from "../runsHttp.js";
import type * as runsLifecycle from "../runsLifecycle.js";
import type * as runsNaming from "../runsNaming.js";
import type * as runsQuery from "../runsQuery.js";
import type * as runsRead from "../runsRead.js";
import type * as runtimeBootstrap from "../runtimeBootstrap.js";
import type * as runtimeProvisioning from "../runtimeProvisioning.js";
import type * as secretTokens from "../secretTokens.js";
import type * as serves from "../serves.js";
import type * as servesAccess from "../servesAccess.js";
import type * as servesConstants from "../servesConstants.js";
import type * as servesHttp from "../servesHttp.js";
import type * as servesLifecycle from "../servesLifecycle.js";
import type * as servesRead from "../servesRead.js";
import type * as sharing from "../sharing.js";
import type * as sleep from "../sleep.js";
import type * as storage from "../storage.js";
import type * as syncManifest from "../syncManifest.js";
import type * as uploadLimits from "../uploadLimits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  appConfig: typeof appConfig;
  auth: typeof auth;
  catalog: typeof catalog;
  "cli/data": typeof cli_data;
  "cli/envVars": typeof cli_envVars;
  "cli/environments": typeof cli_environments;
  "cli/runs": typeof cli_runs;
  "cli/serves": typeof cli_serves;
  "cli/shared": typeof cli_shared;
  "cli/sync": typeof cli_sync;
  "cli/system": typeof cli_system;
  "cloud/authConfig": typeof cloud_authConfig;
  "cloud/billing": typeof cloud_billing;
  "cloud/credits": typeof cloud_credits;
  "cloud/errors": typeof cloud_errors;
  "cloud/resend": typeof cloud_resend;
  "cloud/runBilling": typeof cloud_runBilling;
  "cloud/runLifecycleComposition": typeof cloud_runLifecycleComposition;
  "cloud/runpodComputeComposition": typeof cloud_runpodComputeComposition;
  "cloud/serveBilling": typeof cloud_serveBilling;
  "cloud/serveLifecycleComposition": typeof cloud_serveLifecycleComposition;
  computeProvider: typeof computeProvider;
  computeSessionAssignment: typeof computeSessionAssignment;
  computeSessions: typeof computeSessions;
  computeSessionsRead: typeof computeSessionsRead;
  convexJobQueue: typeof convexJobQueue;
  "core/compute": typeof core_compute;
  "core/computeSessionLifecyclePlan": typeof core_computeSessionLifecyclePlan;
  "core/jobQueue": typeof core_jobQueue;
  "core/runLifecyclePlan": typeof core_runLifecyclePlan;
  "core/runTiming": typeof core_runTiming;
  "core/serveLifecyclePlan": typeof core_serveLifecyclePlan;
  "core/storage": typeof core_storage;
  credentialsCrypto: typeof credentialsCrypto;
  credits: typeof credits;
  crons: typeof crons;
  crypto: typeof crypto;
  data: typeof data;
  envVars: typeof envVars;
  environments: typeof environments;
  http: typeof http;
  ids: typeof ids;
  maintenance: typeof maintenance;
  "monitoring/wandb": typeof monitoring_wandb;
  objectStore: typeof objectStore;
  r2ObjectStore: typeof r2ObjectStore;
  resend: typeof resend;
  runpodComputeProvider: typeof runpodComputeProvider;
  runpodCredentialSecrets: typeof runpodCredentialSecrets;
  runs: typeof runs;
  runsAccess: typeof runsAccess;
  runsConstants: typeof runsConstants;
  runsHttp: typeof runsHttp;
  runsLifecycle: typeof runsLifecycle;
  runsNaming: typeof runsNaming;
  runsQuery: typeof runsQuery;
  runsRead: typeof runsRead;
  runtimeBootstrap: typeof runtimeBootstrap;
  runtimeProvisioning: typeof runtimeProvisioning;
  secretTokens: typeof secretTokens;
  serves: typeof serves;
  servesAccess: typeof servesAccess;
  servesConstants: typeof servesConstants;
  servesHttp: typeof servesHttp;
  servesLifecycle: typeof servesLifecycle;
  servesRead: typeof servesRead;
  sharing: typeof sharing;
  sleep: typeof sleep;
  storage: typeof storage;
  syncManifest: typeof syncManifest;
  uploadLimits: typeof uploadLimits;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
  workpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"workpool">;
};
