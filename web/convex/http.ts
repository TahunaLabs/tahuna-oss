import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "@convex/auth";
import { getConfig, getGpus, health, optionsHandler } from "@convex/cli/system";
import { getDataItem, listDataItems } from "@convex/cli/data";
import {
  commitSync,
  createBlobUploadUrl,
  createManifestUploadUrl,
  listMissingBlobHashes,
} from "@convex/cli/sync";
import {
  createEnvironment,
  createRunFromEnvironment,
  getEnvironment,
  listEnvironments,
  removeEnvironment,
  updateEnvironmentSpecs,
} from "@convex/cli/environments";
import { getEnvVar, listEnvVars, removeEnvVar, setEnvVars } from "@convex/cli/envVars";
import { createRun, getRunOrLogs, listRuns, postRunRuntime, removeRun, renameRun } from "@convex/cli/runs";
import { createServe, getServeOrLogs, listServes, postServeAction } from "@convex/cli/serves";
import { fileStream as wandbFileStream, graphql as wandbGraphql, upload as wandbUpload } from "@convex/monitoring/wandb";

const http = httpRouter();

// CORS Preflight
http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: optionsHandler });

// Health and GPUs
http.route({ path: "/api/health", method: "GET", handler: health });
http.route({ path: "/api/gpus", method: "GET", handler: getGpus });
http.route({ path: "/api/config", method: "GET", handler: getConfig });
http.route({ path: "/api/data", method: "GET", handler: listDataItems });
http.route({ pathPrefix: "/api/data/", method: "GET", handler: getDataItem });
http.route({ path: "/api/env_vars", method: "GET", handler: listEnvVars });
http.route({ path: "/api/env_vars", method: "POST", handler: setEnvVars });
http.route({ pathPrefix: "/api/env_vars/", method: "GET", handler: getEnvVar });
http.route({ pathPrefix: "/api/env_vars/", method: "DELETE", handler: removeEnvVar });

// Sync helpers for CLI
http.route({ path: "/api/sync/blobs/missing", method: "POST", handler: listMissingBlobHashes });
http.route({ path: "/api/sync/blobs/upload-url", method: "POST", handler: createBlobUploadUrl });
http.route({ path: "/api/sync/manifests/upload-url", method: "POST", handler: createManifestUploadUrl });
http.route({ path: "/api/sync/commit", method: "POST", handler: commitSync });

// Environments (REST)
http.route({ path: "/api/environments", method: "GET", handler: listEnvironments });
http.route({ path: "/api/environments", method: "POST", handler: createEnvironment });
http.route({ pathPrefix: "/api/environments/", method: "GET", handler: getEnvironment });
http.route({ pathPrefix: "/api/environments/", method: "PATCH", handler: updateEnvironmentSpecs });
http.route({ pathPrefix: "/api/environments/", method: "POST", handler: createRunFromEnvironment });
// Route prefix for environments deletion e.g. /api/environments/{env_id}
http.route({ pathPrefix: "/api/environments/", method: "DELETE", handler: removeEnvironment });

// Runs (REST)
http.route({ path: "/api/runs", method: "GET", handler: listRuns });
http.route({ path: "/api/runs", method: "POST", handler: createRun });
// Route prefix for machine runtime callbacks: /api/runs/{run_id}/runtime/{action}
http.route({ pathPrefix: "/api/runs/", method: "POST", handler: postRunRuntime });
// Route prefix for getting runs by ID /api/runs/{run_id} or /logs
http.route({ pathPrefix: "/api/runs/", method: "GET", handler: getRunOrLogs });
// Route prefix for renaming runs by ID /api/runs/{run_id}
http.route({ pathPrefix: "/api/runs/", method: "PATCH", handler: renameRun });
// Route prefix for deleting runs by ID /api/runs/{run_id}
http.route({ pathPrefix: "/api/runs/", method: "DELETE", handler: removeRun });

// Serves (REST)
http.route({ path: "/api/serves", method: "GET", handler: listServes });
http.route({ path: "/api/serves", method: "POST", handler: createServe });
http.route({ pathPrefix: "/api/serves/", method: "POST", handler: postServeAction });
http.route({ pathPrefix: "/api/serves/", method: "GET", handler: getServeOrLogs });

// Monitoring (W&B-compatible)
http.route({ path: "/api/monitoring/wandb/graphql", method: "POST", handler: wandbGraphql });
http.route({ pathPrefix: "/api/monitoring/wandb/files/", method: "POST", handler: wandbFileStream });
http.route({ pathPrefix: "/api/monitoring/wandb/upload/", method: "PUT", handler: wandbUpload });

// Let's just mount getRunLogs explicitly using a custom handler that delegates if we could, or just let getRun dispatch.
// No, the user provided exact matches for CLI endpoints in nextjs. We can register BetterAuth routes below.

authComponent.registerRoutes(http, createAuth);

export default http;
