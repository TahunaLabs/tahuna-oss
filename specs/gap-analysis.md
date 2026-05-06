# Spec Drift Notes

Last reviewed: 2026-05-07

## Current State

The old gap analysis mixed audit findings, issue tracking, and proposed work. The specs in this directory now document the current codebase instead.

## How To Read Drift Now

When code behavior changes, update the affected spec directly. Avoid carrying a parallel list of intended fixes unless there is a clear user request for planning.

## Current Architecture Summary

- Web: Next.js, React, Convex Auth, dashboard query/mutation/action hooks.
- Backend: Convex schema, HTTP routes under `/api/*`, object-store integration, job queue, Runpod compute adapter.
- CLI: Go binary that calls the backend HTTP API.
- Runtime: Go `warden` binary that bootstraps training or serving machines.
- Storage: object store with Convex indexes for user-visible storage.

## Invariants

- Specs should describe current behavior, not desired behavior.
- Planning details belong outside these current-state specs unless explicitly requested.
