package main

import "net/http"

func (a *app) routes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", a.health)

	mux.HandleFunc("POST /auth/signup", a.signup)
	mux.HandleFunc("POST /auth/signin", a.signin)
	mux.HandleFunc("POST /auth/api-keys", a.withAuth(a.createAPIKey))
	mux.HandleFunc("GET /auth/me", a.withAuth(a.me))

	mux.HandleFunc("GET /catalog", a.withAuth(a.catalog))
	mux.HandleFunc("POST /environments", a.withAuth(a.createEnvironment))
	mux.HandleFunc("GET /environments", a.withAuth(a.listEnvironments))
	mux.HandleFunc("GET /environments/{environment_id}", a.withAuth(a.getEnvironment))
	mux.HandleFunc("DELETE /environments/{environment_id}", a.withAuth(a.deleteEnvironment))
	mux.HandleFunc("POST /environments/{environment_id}/experiments", a.withAuth(a.createExperiment))
	mux.HandleFunc("GET /experiments", a.withAuth(a.listExperiments))
	mux.HandleFunc("GET /experiments/{experiment_id}", a.withAuth(a.getExperiment))
	mux.HandleFunc("DELETE /experiments/{experiment_id}", a.withAuth(a.deleteExperiment))

	mux.HandleFunc("POST /experiments/{experiment_id}/runs", a.withAuth(a.createRun))
	mux.HandleFunc("GET /runs", a.withAuth(a.listRuns))
	mux.HandleFunc("GET /runs/{run_id}", a.withAuth(a.getRun))
	mux.HandleFunc("GET /runs/{run_id}/logs", a.withAuth(a.getRunLogs))
	mux.HandleFunc("DELETE /runs/{run_id}", a.withAuth(a.deleteRun))

	return mux
}
