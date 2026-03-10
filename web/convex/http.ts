import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "@convex/auth";
import {
    commitSync,
    createBlobUploadUrl,
    createEnvironment,
    createManifestUploadUrl,
    createRunFromEnvironment,
    createRun,
    getCatalog,
    getEnvironment,
    updateEnvironmentSpecs,
    getRunOrLogs,
    health,
    listMissingBlobHashes,
    listEnvironments,
    listRuns,
    optionsHandler,
    postRunRuntime,
    removeEnvironment,
    removeRun,
} from "@convex/cli";

const http = httpRouter();

// CORS Preflight
http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: optionsHandler });

// Health and Catalog
http.route({ path: "/api/health", method: "GET", handler: health });
http.route({ path: "/api/catalog", method: "GET", handler: getCatalog });

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
// Route prefix for pod runtime callbacks: /api/runs/{run_id}/runtime/{action}
http.route({ pathPrefix: "/api/runs/", method: "POST", handler: postRunRuntime });
// Route prefix for getting runs by ID /api/runs/{run_id} or /logs
http.route({ pathPrefix: "/api/runs/", method: "GET", handler: getRunOrLogs });
// Route prefix for deleting runs by ID /api/runs/{run_id}
http.route({ pathPrefix: "/api/runs/", method: "DELETE", handler: removeRun });

// Let's just mount getRunLogs explicitly using a custom handler that delegates if we could, or just let getRun dispatch.
// No, the user provided exact matches for CLI endpoints in nextjs. We can register BetterAuth routes below.

authComponent.registerRoutes(http, createAuth);

export default http;
