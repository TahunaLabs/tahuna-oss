import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "@convex/auth";
import {
    createCodeUploadUrl,
    createDataUploadUrl,
    createEnvironment,
    createRunFromEnvironment,
    createRun,
    getCatalog,
    getEnvironment,
    getRunOrLogs,
    health,
    listEnvironments,
    listRuns,
    optionsHandler,
    removeEnvironment,
    removeRun,
    syncObjectMetadata,
} from "@convex/cli";

const http = httpRouter();

// CORS Preflight
http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: optionsHandler });

// Health and Catalog
http.route({ path: "/api/health", method: "GET", handler: health });
http.route({ path: "/api/catalog", method: "GET", handler: getCatalog });

// Sync helpers for CLI
http.route({ path: "/api/sync/code/upload-url", method: "POST", handler: createCodeUploadUrl });
http.route({ path: "/api/sync/data/upload-url", method: "POST", handler: createDataUploadUrl });
http.route({ path: "/api/sync/metadata", method: "POST", handler: syncObjectMetadata });

// Environments (REST)
http.route({ path: "/api/environments", method: "GET", handler: listEnvironments });
http.route({ path: "/api/environments", method: "POST", handler: createEnvironment });
http.route({ pathPrefix: "/api/environments/", method: "GET", handler: getEnvironment });
http.route({ pathPrefix: "/api/environments/", method: "POST", handler: createRunFromEnvironment });
// Route prefix for environments deletion e.g. /api/environments/{env_id}
http.route({ pathPrefix: "/api/environments/", method: "DELETE", handler: removeEnvironment });

// Runs (REST)
http.route({ path: "/api/runs", method: "GET", handler: listRuns });
http.route({ path: "/api/runs", method: "POST", handler: createRun });
// Route prefix for getting runs by ID /api/runs/{run_id} or /logs
http.route({ pathPrefix: "/api/runs/", method: "GET", handler: getRunOrLogs });
// Route prefix for deleting runs by ID /api/runs/{run_id}
http.route({ pathPrefix: "/api/runs/", method: "DELETE", handler: removeRun });

// Let's just mount getRunLogs explicitly using a custom handler that delegates if we could, or just let getRun dispatch.
// No, the user provided exact matches for CLI endpoints in nextjs. We can register BetterAuth routes below.

authComponent.registerRoutes(http, createAuth);

export default http;
