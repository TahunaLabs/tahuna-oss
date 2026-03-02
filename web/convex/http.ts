import { httpRouter } from "convex/server";
import { createAuth } from "./auth";
import { authComponent } from "./auth-component";
import {
    createEnvironment,
    createRun,
    getCatalog,
    getRunOrLogs,
    health,
    listEnvironments,
    listRuns,
    optionsHandler,
    removeEnvironment,
    removeRun,
} from "./cli";

const http = httpRouter();

// CORS Preflight
http.route({ pathPrefix: "/api/", method: "OPTIONS", handler: optionsHandler });

// Health and Catalog
http.route({ path: "/api/health", method: "GET", handler: health });
http.route({ path: "/api/catalog", method: "GET", handler: getCatalog });

// Environments (REST)
http.route({ path: "/api/environments", method: "GET", handler: listEnvironments });
http.route({ path: "/api/environments", method: "POST", handler: createEnvironment });
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
